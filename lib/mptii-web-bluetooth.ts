/**
 * Print ESC/POS directly from a Web Bluetooth-enabled browser (Bluefy on iPhone).
 * Safari has no Web Bluetooth API; no permission prompt will appear there.
 *
 * Observed on Bisofice MPT-II from nRF Connect:
 *  - ISSC 49535343-FE7D-4AE5-8FA9-9FAFD205E455 / ...8841... WRITE
 *  - UART 18F0 / 2AF1 (when advertised)
 *  - alt E7810A71-73AE-499D-8C15-FAA9AEF0C3F2 / BEF8D6C9... WRITE
 */
export type BluetoothReceiptLine = { text: string; kind?: string };

const services = [
  {
    service: "49535343-FE7D-4AE5-8FA9-9FAFD205E455",
    characteristic: "49535343-8841-43F4-A8D4-ECBE34729BB3",
  },
  { service: "18F0", characteristic: "2AF1" },
  {
    service: "E7810A71-73AE-499D-8C15-FAA9AEF0C3F2",
    characteristic: "BEF8D6C9-9C21-4C9E-B632-BD58C1009F9F",
  },
];

type BLECharacteristic = {
  properties?: { write: boolean; writeWithoutResponse: boolean };
  writeValueWithResponse?: (data: BufferSource) => Promise<void>;
  writeValueWithoutResponse?: (data: BufferSource) => Promise<void>;
  writeValue?: (data: BufferSource) => Promise<void>;
};
type BLEServer = {
  connected: boolean;
  connect: () => Promise<BLEServer>;
  getPrimaryService: (uuid: string) => Promise<{
    getCharacteristic: (uuid: string) => Promise<BLECharacteristic>;
  }>;
};
type BLEDevice = { name?: string; gatt?: BLEServer };
type BrowserBLE = {
  requestDevice: (options: {
    filters: { namePrefix: string }[];
    optionalServices: string[];
  }) => Promise<BLEDevice>;
};

let connectedDevice: BLEDevice | null = null;
let channel: BLECharacteristic | null = null;
let inProgress = false;

export function browserSupportsBLEPrinting() {
  return typeof navigator !== "undefined" &&
    typeof (navigator as Navigator & { bluetooth?: BrowserBLE }).bluetooth?.requestDevice === "function";
}

function normalizeAscii(text: string) {
  return (text
    .replace(/œ/g, "oe")
    .replace(/Œ/g, "OE")
    .replace(/[‘’]/g, "'")
    .replace(/[–—·•]/g, "-")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]/g, "?"));
}

function wrap(text: string, maxColumns = 32): string[] {
  if (!text.trim()) return [""];
  const rows: string[] = [];
  let row = "";
  for (const word of text.trim().split(/\s+/)) {
    let remaining = word;
    while (remaining) {
      const free = maxColumns - row.length - (row ? 1 : 0);
      if (remaining.length <= free) {
        row += (row ? " " : "") + remaining;
        remaining = "";
      } else if (row) {
        rows.push(row);
        row = "";
      } else {
        rows.push(remaining.slice(0, maxColumns));
        remaining = remaining.slice(maxColumns);
      }
    }
  }
  if (row) rows.push(row);
  return rows;
}

export function createMPTIIReceipt(lines: BluetoothReceiptLine[]): Uint8Array {
  const data: number[] = [0x1b, 0x40]; // ESC/POS initialize
  for (const line of lines) {
    if (line.kind === "rule") {
      data.push(...new TextEncoder().encode("-".repeat(32)), 0x0a);
      continue;
    }
    const center = line.kind === "title" || line.kind === "subtitle";
    const bold = line.kind === "title" || line.kind === "heading" || line.kind === "bold";
    data.push(0x1b, 0x61, center ? 1 : 0, 0x1b, 0x45, bold ? 1 : 0);
    for (const segment of wrap(normalizeAscii(line.text))) {
      const padded = center ? " ".repeat(Math.max(0, Math.floor((32 - segment.length) / 2))) + segment : segment;
      data.push(...new TextEncoder().encode(padded), 0x0a);
    }
  }
  data.push(0x1b, 0x45, 0, 0x1b, 0x61, 0, 0x0a, 0x0a, 0x0a);
  return new Uint8Array(data);
}

async function obtainWriter(): Promise<BLECharacteristic> {
  if (connectedDevice?.gatt?.connected && channel) return channel;

  const bluetooth = (navigator as Navigator & { bluetooth?: BrowserBLE }).bluetooth;
  if (!bluetooth) throw new Error("Ouvrez Mes Courses Téo dans Bluefy pour imprimer par Bluetooth.");

  // requestDevice must run as part of a real button tap, not an effect.
  if (!connectedDevice) {
    connectedDevice = await bluetooth.requestDevice({
      filters: [{ namePrefix: "MPT" }],
      optionalServices: services.map(({ service }) => service),
    });
  }
  if (!connectedDevice.name?.toUpperCase().includes("MPT")) {
    connectedDevice = null;
    throw new Error("Sélectionnez votre imprimante MPT-II.");
  }
  const server = connectedDevice.gatt;
  if (!server) throw new Error("Cette connexion Bluetooth ne fournit pas de service d'impression.");
  if (!server.connected) await server.connect();

  for (const item of services) {
    try {
      const service = await server.getPrimaryService(item.service);
      const candidate = await service.getCharacteristic(item.characteristic);
      if (candidate.properties?.write || candidate.properties?.writeWithoutResponse ||
          candidate.writeValueWithResponse || candidate.writeValueWithoutResponse || candidate.writeValue) {
        channel = candidate;
        return candidate;
      }
    } catch {
      // The printer firmware may expose only one of these characteristics.
    }
  }
  throw new Error("Le canal Bluetooth de la MPT-II n'a pas été trouvé.");
}

const pause = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export async function printMPTIIInBrowser(lines: BluetoothReceiptLine[]): Promise<void> {
  if (!browserSupportsBLEPrinting()) {
    throw new Error("Safari ne permet pas cette impression directe. Ouvrez le site dans Bluefy.");
  }
  if (inProgress) throw new Error("Une impression Bluetooth est déjà en cours.");
  inProgress = true;
  try {
    const writer = await obtainWriter();
    const bytes = createMPTIIReceipt(lines);
    // Conservative packet sizes for MPT-II BLE firmware; especially important
    // for write-without-response, which does not acknowledge every packet.
    for (let offset = 0; offset < bytes.length; offset += 20) {
      const payload = bytes.slice(offset, offset + 20);
      if (writer.properties?.write && writer.writeValueWithResponse) {
        await writer.writeValueWithResponse(payload);
      } else if (writer.properties?.writeWithoutResponse && writer.writeValueWithoutResponse) {
        await writer.writeValueWithoutResponse(payload);
      } else if (writer.writeValue) {
        await writer.writeValue(payload);
      } else if (writer.writeValueWithResponse) {
        await writer.writeValueWithResponse(payload);
      } else if (writer.writeValueWithoutResponse) {
        await writer.writeValueWithoutResponse(payload);
      } else {
        throw new Error("L'imprimante ne propose pas de fonction d'écriture BLE.");
      }
      await pause(35);
    }
    // Completion acknowledges the browser write, not verified paper output.
  } catch (error) {
    channel = null;
    if (!connectedDevice?.gatt?.connected) connectedDevice = null;
    if (error instanceof Error && error.name === "NotFoundError") {
      throw new Error("Aucune imprimante choisie. Allumez MPT-II et réessayez.");
    }
    throw error;
  } finally {
    inProgress = false;
  }
}

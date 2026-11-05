import Foundation
import CoreBluetooth

struct ReceiptLine {
    let text: String
    let kind: String
}

enum PrinterError: LocalizedError {
    case busy, bluetoothUnavailable, notFound, disconnected, noWriteCharacteristic
    case connectionFailed, sendingFailed

    var errorDescription: String? {
        switch self {
        case .busy: return "Une impression est déjà en cours."
        case .bluetoothUnavailable: return "Activez le Bluetooth dans les réglages de l’iPhone."
        case .notFound: return "MPT-II introuvable. Allumez l’imprimante et fermez nRF Connect."
        case .disconnected: return "La connexion Bluetooth avec la MPT-II a été interrompue."
        case .noWriteCharacteristic: return "Aucun canal d’impression ESC/POS compatible n’a été trouvé."
        case .connectionFailed: return "Impossible de connecter la Bisofice MPT-II."
        case .sendingFailed: return "L’envoi du ticket Bluetooth a échoué."
        }
    }
}

final class MPTIIPrinter: NSObject, CBCentralManagerDelegate, CBPeripheralDelegate {
    private static let serviceUART = CBUUID(string: "18F0")
    private static let writeUART = CBUUID(string: "2AF1")

    private static let serviceISSC = CBUUID(string: "49535343-FE7D-4AE5-8FA9-9FAFD205E455")
    private static let writeISSC = CBUUID(string: "49535343-8841-43F4-A8D4-ECBE34729BB3")

    private static let serviceAlt = CBUUID(string: "E7810A71-73AE-499D-8C15-FAA9AEF0C3F2")
    private static let writeAlt = CBUUID(string: "BEF8D6C9-9C21-4C9E-B632-BD58C1009F9F")

    private var central: CBCentralManager!
    private var peripheral: CBPeripheral?
    private var characteristic: CBCharacteristic?
    private var availableWrites: [(rank: Int, characteristic: CBCharacteristic)] = []
    private var pendingDiscovery = 0
    private var scanningTimeout: DispatchWorkItem?

    private var bytes = Data()
    private var offset = 0
    private var chunkSize = 20
    private var writeType: CBCharacteristicWriteType = .withoutResponse
    private var completion: ((Result<Void, Error>) -> Void)?

    override init() {
        super.init()
        central = CBCentralManager(delegate: self, queue: .main)
    }

    func printReceipt(_ lines: [ReceiptLine],
                      completion: @escaping (Result<Void, Error>) -> Void) {
        guard self.completion == nil else {
            completion(.failure(PrinterError.busy))
            return
        }
        self.completion = completion
        bytes = Self.makeTicket(lines)
        offset = 0
        if central.state == .poweredOn {
            beginConnection()
        } else if central.state != .unknown && central.state != .resetting {
            finish(.failure(PrinterError.bluetoothUnavailable))
        }
        // Bluetooth state will be delivered asynchronously for .unknown/.resetting.
    }

    func centralManagerDidUpdateState(_ central: CBCentralManager) {
        guard completion != nil else { return }
        if central.state == .poweredOn {
            beginConnection()
        } else if central.state != .unknown && central.state != .resetting {
            finish(.failure(PrinterError.bluetoothUnavailable))
        }
    }

    private func beginConnection() {
        if let peripheral, peripheral.state == .connected, let characteristic {
            configureWriter(peripheral: peripheral, characteristic: characteristic)
            return
        }

        characteristic = nil
        availableWrites.removeAll()
        if let identifier = UserDefaults.standard.string(forKey: "MPTII.BLE.UUID"),
           let uuid = UUID(uuidString: identifier),
           let remembered = central.retrievePeripherals(withIdentifiers: [uuid]).first {
            connect(remembered)
            return
        }
        beginScan()
    }

    private func connect(_ device: CBPeripheral) {
        central.stopScan()
        scanningTimeout?.cancel()
        peripheral = device
        device.delegate = self
        central.connect(device, options: nil)
        startTimeout(seconds: 14, error: .connectionFailed)
    }

    private func beginScan() {
        central.stopScan()
        central.scanForPeripherals(withServices: nil, options: [
            CBCentralManagerScanOptionAllowDuplicatesKey: false,
        ])
        startTimeout(seconds: 14, error: .notFound)
    }

    private func startTimeout(seconds: Double, error: PrinterError) {
        scanningTimeout?.cancel()
        let work = DispatchWorkItem { [weak self] in
            guard let self, self.completion != nil else { return }
            if error == .connectionFailed {
                // A previously paired device may have changed its BLE identifier.
                self.peripheral = nil
                self.characteristic = nil
                UserDefaults.standard.removeObject(forKey: "MPTII.BLE.UUID")
                self.beginScan()
            } else {
                self.finish(.failure(error))
            }
        }
        scanningTimeout = work
        DispatchQueue.main.asyncAfter(deadline: .now() + seconds, execute: work)
    }

    func centralManager(_ central: CBCentralManager, didDiscover device: CBPeripheral,
                        advertisementData: [String: Any], rssi RSSI: NSNumber) {
        guard completion != nil else { return }
        let name = (device.name ??
                    advertisementData[CBAdvertisementDataLocalNameKey] as? String ?? "").uppercased()
        guard name.contains("MPT-II") || name.contains("MPT_II") else { return }
        connect(device)
    }

    func centralManager(_ central: CBCentralManager, didConnect device: CBPeripheral) {
        scanningTimeout?.cancel()
        peripheral = device
        device.delegate = self
        UserDefaults.standard.set(device.identifier.uuidString, forKey: "MPTII.BLE.UUID")
        availableWrites.removeAll()
        characteristic = nil
        device.discoverServices([
            Self.serviceUART, Self.serviceISSC, Self.serviceAlt,
        ])
        startTimeout(seconds: 14, error: .notFound)
    }

    func centralManager(_ central: CBCentralManager, didFailToConnect device: CBPeripheral,
                        error: Error?) {
        peripheral = nil
        characteristic = nil
        UserDefaults.standard.removeObject(forKey: "MPTII.BLE.UUID")
        if completion != nil { beginScan() }
    }

    func centralManager(_ central: CBCentralManager, didDisconnectPeripheral device: CBPeripheral,
                        error: Error?) {
        peripheral = nil
        characteristic = nil
        if completion != nil { finish(.failure(PrinterError.disconnected)) }
    }

    func peripheral(_ device: CBPeripheral, didDiscoverServices error: Error?) {
        scanningTimeout?.cancel()
        guard completion != nil else { return }
        guard error == nil, let services = device.services else {
            finish(.failure(PrinterError.noWriteCharacteristic))
            return
        }
        let eligible = services.filter {
            [Self.serviceUART, Self.serviceISSC, Self.serviceAlt].contains($0.uuid)
        }
        pendingDiscovery = eligible.count
        guard pendingDiscovery > 0 else {
            finish(.failure(PrinterError.noWriteCharacteristic))
            return
        }
        for service in eligible { device.discoverCharacteristics(nil, for: service) }
        startTimeout(seconds: 12, error: .notFound)
    }

    func peripheral(_ device: CBPeripheral, didDiscoverCharacteristicsFor service: CBService,
                    error: Error?) {
        guard completion != nil else { return }
        if error == nil {
            for candidate in service.characteristics ?? [] {
                guard candidate.properties.contains(.write) ||
                      candidate.properties.contains(.writeWithoutResponse) else { continue }
                let rank: Int
                if service.uuid == Self.serviceUART && candidate.uuid == Self.writeUART {
                    rank = 0
                } else if service.uuid == Self.serviceISSC && candidate.uuid == Self.writeISSC {
                    rank = 1
                } else if service.uuid == Self.serviceAlt && candidate.uuid == Self.writeAlt {
                    rank = 2
                } else {
                    continue
                }
                availableWrites.append((rank, candidate))
            }
        }
        pendingDiscovery -= 1
        if pendingDiscovery == 0 {
            scanningTimeout?.cancel()
            guard let preferred = availableWrites.min(by: { $0.rank < $1.rank }) else {
                finish(.failure(PrinterError.noWriteCharacteristic))
                return
            }
            characteristic = preferred.characteristic
            configureWriter(peripheral: device, characteristic: preferred.characteristic)
        }
    }

    private func configureWriter(peripheral: CBPeripheral, characteristic: CBCharacteristic) {
        // .withResponse waits for an acknowledgement of each chunk where available.
        writeType = characteristic.properties.contains(.write) ? .withResponse : .withoutResponse
        let maxLength = peripheral.maximumWriteValueLength(for: writeType)
        chunkSize = max(1, min(20, maxLength)) // Conservative 20-byte packets for MPT-II.
        sendNext()
    }

    private func sendNext() {
        guard completion != nil, let peripheral, let characteristic,
              peripheral.state == .connected else {
            finish(.failure(PrinterError.disconnected))
            return
        }
        if offset >= bytes.count {
            // "success" means bytes were sent by CoreBluetooth, not paper verified.
            finish(.success(()))
            return
        }
        if writeType == .withoutResponse && !peripheral.canSendWriteWithoutResponse {
            // CoreBluetooth will call peripheralIsReady(toSendWriteWithoutResponse:).
            return
        }
        let upper = min(offset + chunkSize, bytes.count)
        let fragment = bytes.subdata(in: offset..<upper)
        offset = upper
        peripheral.writeValue(fragment, for: characteristic, type: writeType)
        if writeType == .withoutResponse {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.028) { [weak self] in
                self?.sendNext()
            }
        }
    }

    func peripheral(_ peripheral: CBPeripheral, didWriteValueFor characteristic: CBCharacteristic,
                    error: Error?) {
        guard completion != nil else { return }
        if error != nil {
            finish(.failure(PrinterError.sendingFailed))
        } else {
            sendNext()
        }
    }

    func peripheralIsReady(toSendWriteWithoutResponse peripheral: CBPeripheral) {
        if writeType == .withoutResponse, completion != nil {
            sendNext()
        }
    }

    private func finish(_ result: Result<Void, Error>) {
        scanningTimeout?.cancel()
        scanningTimeout = nil
        central.stopScan()
        let callback = completion
        completion = nil
        bytes.removeAll()
        offset = 0
        callback?(result)
    }

    private static func makeTicket(_ lines: [ReceiptLine]) -> Data {
        var result = Data([0x1B, 0x40])  // ESC @ — initialize ESC/POS
        let columns = 32               // 384 dots / 12 dots per character.
        for line in lines {
            if line.kind == "rule" {
                result.append(contentsOf: Array(String(repeating: "-", count: columns).utf8))
                result.append(0x0A)
                continue
            }
            let centered = line.kind == "title" || line.kind == "subtitle"
            let bold = line.kind == "title" || line.kind == "heading" || line.kind == "bold"
            result.append(contentsOf: [0x1B, 0x61, centered ? 1 : 0])
            result.append(contentsOf: [0x1B, 0x45, bold ? 1 : 0])
            let normalized = ascii(line.text)
            for row in wrap(normalized, width: columns) {
                let padded: String
                if centered, row.count < columns {
                    padded = String(repeating: " ", count: (columns - row.count) / 2) + row
                } else {
                    padded = row
                }
                result.append(contentsOf: Array(padded.utf8))
                result.append(0x0A)
            }
        }
        result.append(contentsOf: [0x1B, 0x45, 0, 0x1B, 0x61, 0])
        result.append(contentsOf: [0x0A, 0x0A, 0x0A])
        return result
    }

    private static func ascii(_ text: String) -> String {
        let replaced = text
            .replacingOccurrences(of: "œ", with: "oe")
            .replacingOccurrences(of: "Œ", with: "OE")
            .replacingOccurrences(of: "’", with: "'")
            .replacingOccurrences(of: "•", with: "-")
            .replacingOccurrences(of: "–", with: "-")
            .replacingOccurrences(of: "—", with: "-")
            .replacingOccurrences(of: "·", with: "-")
        let noAccents = replaced.applyingTransform(.stripDiacritics, reverse: false) ?? replaced
        return String(noAccents.map { $0.isASCII ? $0 : "?" })
    }

    private static func wrap(_ text: String, width: Int) -> [String] {
        if text.isEmpty { return [""] }
        var result: [String] = []
        var line = ""
        for word in text.split(whereSeparator: { $0.isWhitespace }) {
            var remainder = String(word)
            while !remainder.isEmpty {
                let available = width - line.count - (line.isEmpty ? 0 : 1)
                if remainder.count <= available {
                    line += line.isEmpty ? remainder : " " + remainder
                    remainder = ""
                } else if !line.isEmpty {
                    result.append(line)
                    line = ""
                } else {
                    result.append(String(remainder.prefix(width)))
                    remainder = String(remainder.dropFirst(width))
                }
            }
        }
        if !line.isEmpty { result.append(line) }
        return result.isEmpty ? [""] : result
    }
}

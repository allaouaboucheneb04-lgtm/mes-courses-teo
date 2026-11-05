import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";

let env;
const projectId = "demo-teo-security";
const driverPath = (uid) => ["drivers", uid, "data", "app"];
const inspectionPath = (uid, id) => ["drivers", uid, "inspections", id];

before(async () => {
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      rules: await readFile(new URL("../firestore.rules", import.meta.url), "utf8"),
    },
  });
});

after(async () => {
  if (env) await env.cleanup();
});

test("aucun accès anonyme aux données d’un chauffeur", async () => {
  const anonymous = env.unauthenticatedContext();
  await assertFails(getDoc(doc(anonymous.firestore(), ...driverPath("driver-A"))));
  await assertFails(setDoc(doc(anonymous.firestore(), ...driverPath("driver-A")), {
    courses: [],
  }));
});

test("chauffeur A peut accéder à ses données actuelles", async () => {
  const alice = env.authenticatedContext("driver-A");
  const ref = doc(alice.firestore(), ...driverPath("driver-A"));
  await assertSucceeds(setDoc(ref, { courses: [{ id: "course-1", amount: 250 }] }));
  await assertSucceeds(getDoc(ref));
});

test("chauffeur B ne peut ni lire ni modifier les données de A", async () => {
  const bob = env.authenticatedContext("driver-B");
  const aliceDoc = doc(bob.firestore(), ...driverPath("driver-A"));
  await assertFails(getDoc(aliceDoc));
  await assertFails(setDoc(aliceDoc, { courses: [] }));
});

test("une sous-collection de vérifications reste privée", async () => {
  const alice = env.authenticatedContext("driver-A");
  const bob = env.authenticatedContext("driver-B");
  await assertSucceeds(setDoc(
    doc(alice.firestore(), ...inspectionPath("driver-A", "inspection-1")),
    { confirmed: true },
  ));
  await assertFails(getDoc(
    doc(bob.firestore(), ...inspectionPath("driver-A", "inspection-1")),
  ));
  await assertFails(setDoc(
    doc(bob.firestore(), ...inspectionPath("driver-A", "inspection-1")),
    { confirmed: false },
  ));
});

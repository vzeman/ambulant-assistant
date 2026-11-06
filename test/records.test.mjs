import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { listDoctorReports } from "../records.mjs";

test("legacy generated reports are recovered from disk without duplicates or treating drafts as confirmed", async () => {
  const data = await mkdtemp(path.join(tmpdir(), "ambulant-records-test-"));
  const session = (id) => ({
    id,
    patient: { name: "Fiktívny pacient" },
    protocol: {
      title: "Test",
      questions: [{ id: "reason", label: "Dôvod návštevy", when: null }],
    },
    result: { answers: [], urgent: false },
    draft: "Syntetický návrh protokolu.",
  });
  try {
    await mkdir(path.join(data, "reports"));
    await mkdir(path.join(data, "sessions"));
    await writeFile(
      path.join(data, "sessions", "draft.json"),
      JSON.stringify(session("draft")),
    );
    await writeFile(
      path.join(data, "sessions", "confirmed.json"),
      JSON.stringify(session("confirmed")),
    );
    await writeFile(
      path.join(data, "sessions", "unfinished.json"),
      JSON.stringify({ ...session("unfinished"), draft: null }),
    );
    await writeFile(
      path.join(data, "reports", "confirmed.json"),
      JSON.stringify({
        id: "confirmed",
        text: "Potvrdený protokol.",
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const reports = await listDoctorReports(data);
    assert.equal(reports.length, 2);
    assert.equal(reports.find((r) => r.id === "draft").patientConfirmed, false);
    assert.ok(reports.find((r) => r.id === "draft").createdAt);
    assert.equal(
      reports.find((r) => r.id === "confirmed").patientConfirmed,
      true,
    );
    assert.equal(
      reports.find((r) => r.id === "confirmed").text,
      "Potvrdený protokol.",
    );
  } finally {
    await rm(data, { recursive: true, force: true });
  }
});

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { coverage } from "./core.mjs";

export function reportFromSession(
  session,
  {
    confirmed = false,
    createdAt = session.reportPreparedAt || new Date().toISOString(),
  } = {},
) {
  return {
    id: session.id,
    patient: session.patient.name,
    createdAt,
    protocol: session.protocol.title,
    reportSections: session.protocol.reportSections || [],
    text: session.draft,
    coverage: coverage(session.protocol, session.result.answers),
    answers: session.result.answers,
    urgent: session.result.urgent,
    doctorReviewed: false,
    patientConfirmed: confirmed,
    ...(confirmed ? { confirmedAt: new Date().toISOString() } : {}),
  };
}

// Generated drafts remain visible after a restart, including older sessions.
// The confirmed report always wins over the session snapshot with the same ID.
export async function listDoctorReports(data) {
  const reports = new Map();
  for (const name of (await readdir(path.join(data, "reports"))).filter((n) =>
    n.endsWith(".json"),
  )) {
    const report = JSON.parse(
      await readFile(path.join(data, "reports", name), "utf8"),
    );
    reports.set(report.id, {
      ...report,
      patientConfirmed: report.patientConfirmed !== false,
    });
  }
  for (const name of (await readdir(path.join(data, "sessions"))).filter((n) =>
    n.endsWith(".json"),
  )) {
    const file = path.join(data, "sessions", name);
    const session = JSON.parse(await readFile(file, "utf8"));
    if (
      typeof session.draft !== "string" ||
      !session.draft.trim() ||
      reports.has(session.id)
    )
      continue;
    const createdAt =
      session.reportPreparedAt || (await stat(file)).mtime.toISOString();
    reports.set(session.id, reportFromSession(session, { createdAt }));
  }
  return [...reports.values()].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}

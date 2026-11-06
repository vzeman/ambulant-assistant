const escapeHTML = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );

// This is deliberately a small formatting subset, never arbitrary model HTML.
export function inlineReport(text) {
  return escapeHTML(text)
    .replace(/\*\*([^\n]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/__([^\n]+?)__/g, "<u>$1</u>")
    .replace(/&lt;u&gt;([^\n]+?)&lt;\/u&gt;/gi, "<u>$1</u>");
}
const commonHeadings = [
  "Stručný prehľad pre lekára",
  "Dôvod návštevy a terajšie ťažkosti",
  "Respiračné príznaky a časový priebeh",
  "Varovné príznaky podľa vyjadrenia pacienta",
  "Aktuálna liečba a adherencia",
  "Alergie a expozície",
  "Relevantná dokumentovaná anamnéza",
  "Nezodpovedané otázky a témy na osobný rozhovor",
  "Nezodpovedané okruhy",
];
const titleKey = (title) => plainReport(title).replace(/:$/, "").trim();
function kind(title) {
  if (/stručný prehľad/i.test(title)) return "overview";
  if (/dôvod návštevy|terajšie ťažkosti/i.test(title)) return "lead";
  if (/varovné príznaky/i.test(title)) return "safety";
  if (/nezodpovedané|nezistené|na osobný rozhovor|na overenie/i.test(title))
    return "verify";
  return "normal";
}
export function reportSections(text, customHeadings = []) {
  const headings = new Set(
    [...commonHeadings, ...customHeadings].map(titleKey),
  );
  const sections = [];
  let current = { title: "", lines: [] };
  const flush = () => {
    if (current.title || current.lines.some((l) => l.trim()))
      sections.push(current);
  };
  const lines = String(text ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i],
      trimmed = line.trim();
    const markdown = trimmed.match(/^#{1,4}\s+(.+?)\s*#*$/);
    const key = titleKey(trimmed);
    const legacyHeading =
      headings.has(key) ||
      (trimmed &&
        trimmed.length < 110 &&
        !/[.!?;]$/.test(trimmed) &&
        !/^[-•*\d]/.test(trimmed) &&
        (!i || !lines[i - 1].trim()) &&
        lines[i + 1]?.trim() &&
        !/^NEÚPLNÝ ROZHOVOR/i.test(trimmed));
    if (markdown || legacyHeading) {
      flush();
      current = { title: markdown ? titleKey(markdown[1]) : key, lines: [] };
    } else current.lines.push(line);
  }
  flush();
  return sections;
}
function bodyHTML(lines, emphasize = false) {
  const blocks = lines
    .join("\n")
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean);
  return blocks
    .map((block) => {
      const items = block.split("\n");
      if (items.every((line) => /^\s*(?:[-•*]|\d+[.)])\s+/.test(line)))
        return (
          "<ul>" +
          items
            .map(
              (line) =>
                "<li>" +
                inlineReport(line.replace(/^\s*(?:[-•*]|\d+[.)])\s+/, "")) +
                "</li>",
            )
            .join("") +
          "</ul>"
        );
      const body = items.map(inlineReport).join("<br>");
      return (
        "<p>" + (emphasize ? "<strong>" + body + "</strong>" : body) + "</p>"
      );
    })
    .join("");
}
export function renderReport(
  text,
  { reportSections: customHeadings = [], missing = [], urgent = false } = {},
) {
  const sections = reportSections(text, customHeadings);
  const warning = urgent
    ? '<aside class="report-alert"><strong>Upozornenie z rozhovoru: pacient uviedol možné závažné ťažkosti.</strong> Vyžaduje posúdenie zdravotníckym personálom.</aside>'
    : "";
  const missingPanel =
    missing.length &&
    !sections.some((s) => titleKey(s.title) === "Nezodpovedané okruhy")
      ? `<section class="report-section report-section--verify"><h3><u>Doplniť pri osobnom rozhovore</u></h3><ul>${missing.map((q) => `<li>${inlineReport(q)}</li>`).join("")}</ul></section>`
      : "";
  return `<article class="clinical-report">${warning}${sections
    .map((s) => {
      const category = kind(s.title);
      const isPartial =
        !s.title && s.lines.some((l) => /^NEÚPLNÝ ROZHOVOR/.test(l.trim()));
      return `<section class="report-section report-section--${isPartial ? "partial" : category}">${s.title ? `<h3>${category === "verify" ? "<u>" + inlineReport(s.title) + "</u>" : inlineReport(s.title)}</h3>` : ""}${bodyHTML(s.lines, category === "lead" || category === "safety")}</section>`;
    })
    .join("")}${missingPanel}</article>`;
}
export function plainReport(text) {
  return String(text ?? "")
    .replace(/^#{1,4}\s+/gm, "")
    .replace(/\*\*([^\n]+?)\*\*/g, "$1")
    .replace(/__([^\n]+?)__/g, "$1")
    .replace(/<\/?u>/gi, "");
}
export const reportStyles = `
.clinical-report{font:15px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#263d36;white-space:normal;overflow-wrap:anywhere}
.report-section{padding:20px 0;border-bottom:1px solid #e2e8e1;break-inside:avoid}
.report-section:last-child{border-bottom:0}.report-section h3{margin:0 0 10px;font-size:14px;letter-spacing:.02em;color:#174f49;font-weight:750;line-height:1.45}
.report-section p{margin:0 0 10px}.report-section p:last-child{margin-bottom:0}.report-section ul{margin:8px 0;padding-left:22px}.report-section li{margin:7px 0}
.clinical-report strong{font-weight:750;color:#173e35}.clinical-report u{text-decoration-thickness:1.5px;text-underline-offset:3px}
.report-section--overview{background:#edf4ed;border:1px solid #d3e3d1;border-radius:12px;padding:20px;margin-bottom:8px}
.report-section--verify{background:#fbf7e9;border-left:3px solid #cda757;padding:18px 20px;margin-top:16px;border-radius:0 10px 10px 0}
.report-section--partial{font-size:13px;background:#f4f5ef;padding:16px;border-radius:10px;margin-bottom:8px}
.report-alert{background:#fff0ed;border:1px solid #e3a89e;border-radius:10px;padding:16px;margin-bottom:12px;color:#7e3129}
@media print{body{margin:0!important;padding:0!important}.report-document{max-width:none!important}.report-section{padding:12px 0}.report-section--overview,.report-section--verify,.report-section--partial{padding:14px!important;print-color-adjust:exact}}
`;
export function reportDocument(report) {
  const options = {
    reportSections: report.reportSections || [],
    missing: report.coverage?.missing || [],
    urgent: report.urgent,
  };
  return `<!doctype html><html lang="sk"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><title>Správa pre lekára</title><style>${reportStyles}body{margin:0;background:#fff;padding:40px}.report-document{max-width:820px;margin:auto}.report-document header{border-bottom:2px solid #174f49;padding-bottom:20px;margin-bottom:12px}.report-document h1{font-size:25px;margin:0 0 8px}.report-document small{color:#65766d}</style></head><body><main class="report-document"><header><h1>${escapeHTML(report.protocol || "Správa pre lekára")}</h1><p><strong>${escapeHTML(report.patient || "")}</strong> · ${escapeHTML(report.createdAt ? new Date(report.createdAt).toLocaleString("sk-SK") : "")}</p><small>Návrh AI na kontrolu lekárom · ${report.patientConfirmed ? "Potvrdené pacientom" : "Čaká na potvrdenie pacienta"}</small></header>${renderReport(report.text, options)}</main></body></html>`;
}

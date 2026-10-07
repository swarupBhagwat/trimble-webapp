const http = require("http");
const fs = require("fs");
const path = require("path");

const { PROJECT_ID, MODEL_ID, SHARE_TOKEN, PORT = 3000, PUBLIC_URL = `http://localhost:${PORT}`, BIMX_DEVELOPER_ID = "<INSERT BIMX DEVELOPER ID>" } = process.env;
const page = path.join(__dirname, "public", "index.html");
const PHASES = [["Not started", "#cccccc"], ["Procured", "#ffd400"], ["Delivered", "#ff8800"], ["Installed", "#0088ff"], ["Completed", "#00cc00"]];

const { toIfcGuid } = require("./guid");

const readJson = (file, empty) => (fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : empty);
const projects = () => [{ id: "default", name: "Model 1 (previous)", projectId: PROJECT_ID, modelId: MODEL_ID || undefined, shareToken: SHARE_TOKEN }, ...readJson(path.join(__dirname, "projects.json"), [])];
const projectOf = url => {
  const id = url.searchParams.get("project") || "model-1";
  return projects().find(p => p.id === id);
};
const dataFiles = id => ({
  db: path.join(__dirname, id === "default" ? "progress.json" : `progress.${id}.json`),
  history: path.join(__dirname, id === "default" ? "progress_history.json" : `progress_history.${id}.json`),
  schedule: path.join(__dirname, id === "default" ? "schedule.json" : `schedule.${id}.json`),
});
const readDb = id => readJson(dataFiles(id).db, {});
const readHistory = id => readJson(dataFiles(id).history, []);
const fmt = iso => new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
const send = (res, body, type = "application/json", status = 200) => {
  res.writeHead(status, { "Content-Type": type + "; charset=utf-8" });
  res.end(type === "application/json" ? JSON.stringify(body) : body);
};

function form(guid) {
  const data = JSON.stringify({ guid, phases: PHASES }).replace(/</g, "\\u003c");
  return `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>body{font:16px system-ui;margin:0;padding:14px;color:#1f2937}h3{margin:0 0 4px}small{color:#6b7280;word-break:break-all}
button{display:flex;align-items:center;gap:10px;width:100%;margin:8px 0;padding:14px;font:inherit;border:2px solid #dde2ea;border-radius:10px;background:#fff}
button.on{border-color:#14213d;font-weight:600}i{width:14px;height:14px;border-radius:50%;display:inline-block}#msg{margin-top:8px;color:#15803d;min-height:20px}</style>
<h3>Update progress</h3><small id="g"></small>
<div id="btns"></div><div id="msg"></div>
<script>
const { guid, phases } = ${data};
document.getElementById("g").textContent = guid;
const box = document.getElementById("btns"), msg = document.getElementById("msg");
phases.forEach(([name, color], i) => {
  const b = document.createElement("button");
  const dot = document.createElement("i");
  dot.style.background = color;
  b.append(dot, name);
  b.onclick = async () => {
    const r = await (await fetch("/api/progress", { method: "POST", body: JSON.stringify({ guid, phase: i }) })).json();
    msg.textContent = r.error ? "Error: " + r.error : "Saved: " + name;
    msg.style.color = r.error ? "#b91c1c" : "#15803d";
    [...box.children].forEach((c, j) => c.classList.toggle("on", j === i && !r.error));
  };
  box.appendChild(b);
});
</script>`;
}

function readBody(req, cb) {
  let body = "";
  req.on("data", c => (body += c));
  req.on("end", () => cb(body));
}

function handle(req, res) {
  const url = new URL(req.url, "http://x");
  const guidParam = url.searchParams.get("element_guid") || "";
  if (url.pathname.startsWith("/bimx/")) console.log(new Date().toISOString(), req.method, req.url);

  if (url.pathname === "/api/projects") return send(res, projects().map(({ id, name }) => ({ id, name })));
  const project = projectOf(url);
  if (url.pathname.startsWith("/api/") && !project) return send(res, { error: "unknown project" }, "application/json", 404);

  if (url.pathname === "/api/trimble-session") {
    return send(res, { projectId: project.projectId, modelId: project.modelId, shareToken: project.shareToken });
  }
  if (url.pathname === "/api/progress" && req.method === "GET") return send(res, readDb(project.id));
  if (url.pathname === "/api/history" && req.method === "GET") return send(res, readHistory(project.id));
  if (url.pathname === "/api/schedule" && req.method === "GET") return send(res, readJson(dataFiles(project.id).schedule, []));
  if (url.pathname === "/api/schedule" && req.method === "POST") {
    return readBody(req, body => {
      try {
        const tasks = JSON.parse(body);
        const ok = t => ["id", "name", "start", "end"].every(k => typeof t[k] === "string") && Array.isArray(t.guids);
        if (!Array.isArray(tasks) || !tasks.every(ok)) throw new Error("bad schedule");
        fs.writeFileSync(dataFiles(project.id).schedule, JSON.stringify(tasks));
        send(res, { saved: tasks.length });
      } catch (e) {
        send(res, { error: String(e.message) }, "application/json", 400);
      }
    });
  }
  if (url.pathname === "/api/reset" && req.method === "POST") {
    fs.rmSync(dataFiles(project.id).db, { force: true });
    fs.rmSync(dataFiles(project.id).history, { force: true });
    return send(res, { reset: true });
  }
  if (url.pathname === "/api/progress" && req.method === "POST") {
    return readBody(req, body => {
      try {
        const rows = [].concat(JSON.parse(body));
        const db = readDb(project.id);
        const log = readHistory(project.id);
        const at = new Date().toISOString();
        for (const { guid, phase } of rows) {
          if (typeof guid !== "string" || ![0, 1, 2, 3, 4].includes(phase)) throw new Error("bad row");
          const key = toIfcGuid(guid);
          db[key] = { phase, at };
          log.push({ guid: key, phase, at });
        }
        fs.writeFileSync(dataFiles(project.id).db, JSON.stringify(db));
        fs.writeFileSync(dataFiles(project.id).history, JSON.stringify(log));
        send(res, { saved: rows.length });
      } catch (e) {
        send(res, { error: String(e.message) }, "application/json", 400);
      }
    });
  }

  if (url.pathname === "/bimx/progress-form") return send(res, form(guidParam), "text/html");
  if (url.pathname === "/bimx/elem-info") {
    const rec = readDb("default")[toIfcGuid(guidParam)];
    const items = rec
      ? [{ key: "Progress phase", value: PHASES[rec.phase][0], position: "top" }, { key: "Recorded", value: fmt(rec.at), position: "top" }]
      : [{ key: "Progress phase", value: "No progress recorded", position: "top" }];
    items.push({ key: "Details", value: `[Open 4D app](${PUBLIC_URL}/)`, position: "bottom" });
    return send(res, { items });
  }
  if (url.pathname === "/bd-4d.bimxx") {
    return send(res, {
      name: "BD 4D Progress",
      developer_id: BIMX_DEVELOPER_ID,
      update_url: `${PUBLIC_URL}/bd-4d.bimxx`,
      elem_context_menu: [{ title: "Update progress", url: `${PUBLIC_URL}/bimx/progress-form?element_guid=$(element_guid)`, position: "left", style: "popover" }],
      project_info: [{ title: "BD 4D app", url: `${PUBLIC_URL}/`, style: "browser" }],
      elem_info: { url: `${PUBLIC_URL}/bimx/elem-info?element_guid=$(element_guid)`, http_headers: [{ field: "Accept", value: "application/json" }] },
    });
  }

  if (url.pathname === "/prototype") return send(res, fs.readFileSync(path.join(__dirname, "public", "prototype.html")), "text/html");
  send(res, fs.readFileSync(page), "text/html");
}

http.createServer((req, res) => {
  try {
    handle(req, res);
  } catch (e) {
    console.error(new Date().toISOString(), req.method, req.url, e);
    if (!res.headersSent) send(res, { error: String(e.message) }, "application/json", 500);
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}`));

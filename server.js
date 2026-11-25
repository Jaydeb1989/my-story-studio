import express from "express";
import multer from "multer";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, "public")));
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 2 }
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, configured: Boolean(process.env.OPENAI_API_KEY) });
});

app.post("/api/generate", upload.fields([
  { name: "boy", maxCount: 1 },
  { name: "girl", maxCount: 1 }
]), async (req, res) => {
  try {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(503).json({ error: "Server पर OpenAI API Key सेट नहीं है। Hosting की Environment Variables में OPENAI_API_KEY जोड़ें।" });
    }

    const prompt = String(req.body.prompt || "").trim();
    const model = String(req.body.model || "gpt-image-2.6-flare");
    const size = String(req.body.size || "1536x1024");
    const quality = String(req.body.quality || "high");

    if (!prompt) return res.status(400).json({ error: "Scene prompt खाली है।" });
    if (!["gpt-image-2.6-flare", "gpt-image-2.6-sunburst", "gpt-image-2.5-flare", "gpt-image-2.5-sunburst"].includes(model)) {
      return res.status(400).json({ error: "चुना गया image model मान्य नहीं है।" });
    }
    if (!["1024x1024", "1536x1024", "1024x1536"].includes(size)) {
      return res.status(400).json({ error: "Image size मान्य नहीं है।" });
    }
    if (!["low", "medium", "high"].includes(quality)) {
      return res.status(400).json({ error: "Quality मान्य नहीं है।" });
    }

    const files = req.files || {};
    const boy = files.boy?.[0];
    const girl = files.girl?.[0];
    if (!boy || !girl) return res.status(400).json({ error: "लड़के और लड़की—दोनों की reference photo अपलोड करें।" });

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    for (const f of [boy, girl]) {
      if (!allowed.includes(f.mimetype)) {
        return res.status(400).json({ error: "Reference photo JPG, PNG या WEBP होनी चाहिए।" });
      }
    }

    const form = new FormData();
    form.append("model", model);
    form.append("prompt", prompt);
    form.append("size", size);
    form.append("quality", quality);
    form.append("output_format", "png");
    form.append("image[]", new Blob([boy.buffer], { type: boy.mimetype }), boy.originalname || "boy-reference.jpg");
    form.append("image[]", new Blob([girl.buffer], { type: girl.mimetype }), girl.originalname || "girl-reference.jpg");

    const response = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form
    });

    const raw = await response.text();
    let data;
    try { data = JSON.parse(raw); } catch { data = { error: { message: raw.slice(0, 500) } }; }

    if (!response.ok) {
      const message = data?.error?.message || `OpenAI API ने HTTP ${response.status} लौटाया।`;
      return res.status(response.status).json({ error: message });
    }
    const b64 = data?.data?.[0]?.b64_json;
    if (!b64) return res.status(502).json({ error: "API से इमेज डेटा नहीं मिला। कृपया फिर कोशिश करें।" });
    res.json({ image: `data:image/png;base64,${b64}`, revised_prompt: data?.data?.[0]?.revised_prompt || "" });
  } catch (err) {
    console.error("Image generation error:", err);
    res.status(500).json({ error: err?.message || "Server में अनजान समस्या हुई।" });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`My Story Studio running on port ${PORT}`));
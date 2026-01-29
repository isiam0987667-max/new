import express from "express";
import session from "express-session";
import multer from "multer";
import fs from "fs";
import { google } from "googleapis";
import path from "path";

const __dirname = path.resolve();
const app = express();

app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  secret: "video-secret",
  resave: false,
  saveUninitialized: true
}));


// Google OAuth setup
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const REDIRECT = process.env.REDIRECT || "http://localhost:3000/auth/google/callback";
const oauth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT);
const drive = google.drive({ version: "v3", auth: oauth2Client });


// Login route
app.get("/auth/google", (req, res) => {
const url = oauth2Client.generateAuthUrl({
access_type: "offline",
scope: ["https://www.googleapis.com/auth/drive.file"]
});
res.redirect(url);
});


app.get("/auth/google/callback", async (req, res) => {
const { tokens } = await oauth2Client.getToken(req.query.code);
req.session.tokens = tokens;
res.redirect("/");
});


// Upload setup
const upload = multer({ dest: path.join(__dirname, "temp") });
app.post("/upload", upload.single("video"), async (req, res) => {
oauth2Client.setCredentials(req.session.tokens);
const file = await drive.files.create({
requestBody: { name: req.file.originalname },
media: { mimeType: req.file.mimetype, body: fs.createReadStream(req.file.path) }
});
await drive.permissions.create({ fileId: file.data.id, requestBody: { role: "reader", type: "anyone" } });
res.json({ id: file.data.id, name: req.file.originalname });
});


// Public video streaming
app.get("/video/:id", async (req, res) => {
const drivePublic = google.drive({ version: "v3" });
const response = await drivePublic.files.get({ fileId: req.params.id, alt: "media" }, { responseType: "stream" });
response.data.pipe(res);
});


// List videos
app.get("/videos", async (req, res) => {
const drivePublic = google.drive({ version: "v3" });
const list = await drivePublic.files.list({ q: "mimeType contains 'video/'", fields: "files(id,name)" });
res.json(list.data.files);
});


// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));

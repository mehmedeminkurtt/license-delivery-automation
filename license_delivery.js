import express from "express";
import fs from "fs";
import axios from "axios";
import { exec } from "child_process";
import iconv from "iconv-lite";

const app = express();
app.use(express.json());

if (!fs.existsSync("config.json")) {
  console.error('config.json not found. Copy config.example.json to config.json');
  process.exit(1);
}
const config = JSON.parse(fs.readFileSync("config.json", "utf-8"));


const pendingUsers = [];     // { customerUsername, customerId, customerAvatarUrl }
const userStages = {};       // customerId -> "awaiting_name"

async function send(messageText, customer) {
  await axios.post(config.services.router, {
    sender: config.sender,
    customer,
    message: messageText
  });
}

function findPendingUser(customerId) {
  return pendingUsers.find(u => String(u.customerId) === String(customerId));
}

function removePendingUser(customerId) {
  const idx = pendingUsers.findIndex(u => String(u.customerId) === String(customerId));
  if (idx >= 0) pendingUsers.splice(idx, 1);
}

function cleanExeStdoutWindows1254(stdoutBuffer) {
  const decoded = iconv.decode(stdoutBuffer, "windows-1254");

  const cleaned = decoded
    .split("\n")
    .filter(line => !line.trim().startsWith("Active code page") && line.trim() !== "")
    .join("\r\n");

  return iconv.encode(cleaned, "windows-1254");
}

/**
 * Runs your own license creation tool (license_creator.exe).
 * This repository assumes a legitimate tool for a legitimate product.
 *
 * Example:
 * "license_creator.exe" "Printed Name" "Product Name"
 * -> outputs license content to stdout
 */
async function createLicenseFile(printedName) {
  const exePath = config.license?.exePath || "./license_creator.exe";
  const productName = config.license?.productName || "License";
  const outputFile = config.license?.outputFile || "license.lic";

  const command = `"${exePath}" "${printedName}" "${productName}"`;

  return new Promise((resolve, reject) => {
    exec(command, { encoding: "buffer", shell: true }, (error, stdout, stderr) => {
      if (error) return reject(new Error(`License tool error: ${error.message}`));

      if (stderr && stderr.length > 0) {
        return reject(new Error(`License tool stderr: ${stderr.toString()}`));
      }

      const encodedBuffer = cleanExeStdoutWindows1254(stdout);

      fs.writeFile(outputFile, encodedBuffer, (err) => {
        if (err) return reject(new Error(`Failed to write license file: ${err.message}`));
        resolve(outputFile);
      });
    });
  });
}

/**
 * Upload placeholder.
 * Use your own file system / storage provider here.
 * Real credentials/tokens and integrations are intentionally omitted.
 */
async function uploadFilePlaceholder(localFilePath) {
  // Example placeholder link
  return `https://your-storage.example/${encodeURIComponent(localFilePath)}`;
}

app.post("/webhook", async (req, res) => {
  const { details } = req.body || {};

  if (!details || !details.customer || !details.advert) {
    return res.status(400).json({ error: "Missing payload fields!" });
  }

  const { name: customerUsername, id: customerId, avatar: customerAvatarUrl } = details.customer;
  const { title: advertTitle } = details.advert;

  const allowedTitle = config.app?.allowedAdvertTitle || "Personalized Unlimited License";
  if (advertTitle !== allowedTitle) {
    return res.status(200).json({ message: "No action taken (advert not matched)." });
  }

  pendingUsers.push({ customerUsername, customerId, customerAvatarUrl });

  // Ask the user to start
  await send('🤖 To start the license process, type "license". 📥', details.customer);

  return res.status(200).json({ message: "Webhook accepted." });
});

app.post("/incoming-chat", async (req, res) => {
  const msg = String(req.body?.msg || "").trim();
  const customer = req.body?.customer;

  if (!customer?.id || !customer?.name) {
    return res.status(400).json({ error: "Missing customer fields!" });
  }

  const customerId = String(customer.id);
  const pendingUser = findPendingUser(customerId);
  const stage = userStages[customerId];

  // Step 1: user types "license"
  if (msg.toLowerCase() === "license" && pendingUser) {
    userStages[customerId] = "awaiting_name";
    await send("🤖 Please type the name you want to appear on the license. 📝", customer);
    return res.json({ ok: true });
  }

  // Step 2: user sends the printed name
  if (stage === "awaiting_name") {
    const printedName = msg;

    console.log(`Customer ${customer.name} provided printed name: ${printedName}`);

    delete userStages[customerId];
    removePendingUser(customerId);

    try {
      const licenseFilePath = await createLicenseFile(printedName);
      const fileLink = await uploadFilePlaceholder(licenseFilePath);

      await send(`🤖 Here is your license file! 📎\n${fileLink}`, customer);

      return res.json({ ok: true });
    } catch (e) {
      await send(`❌ Failed to create license: ${e?.message || "Unknown error"}`, customer);
      return res.status(500).json({ ok: false });
    }
  }

  return res.json({ ok: true, ignored: true });
});

app.listen(3001, () => console.log('license service running'));
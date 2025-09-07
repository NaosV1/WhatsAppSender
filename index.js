const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const fetch = require('node-fetch'); // for Discord webhook
const app = express();
const port = 3001;

// Discord webhook (replace with yours)
require('dotenv').config();

const DISCORD_WEBHOOK = process.env.DISCORD_WEBHOOK;
const MENTION_ENABLED = process.env.MENTION_ENABLED === 'true';
const MENTION_TEXT = process.env.MENTION_TEXT || '';

let ISREADY = true;

// Send error logs to Discord
async function logError(message, error = null) {
    console.error(message, error || "");
    try {
        await fetch(DISCORD_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: `||${MENTION_ENABLED ? MENTION_TEXT : ""}||\n⚠️ **WhatsApp-Sender Error**\n${message}\n\`\`\`${error ? error.toString() : ""}\`\`\``
            }),
        });
    } catch (err) {
        console.error("Failed to send error to Discord:", err);
    }
}

async function sendSuccess(message = null) {
    try {
        await fetch(DISCORD_WEBHOOK, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                content: `||${MENTION_ENABLED ? MENTION_TEXT : ""}||\n✅ **WhatsApp-Sender Success**\n${message || "The message sent has been successfully delivered!"}`
            }),
        });
    } catch (err) {
        console.error("Failed to send success message to Discord:", err);
    }
}

app.listen(port, () => {
    console.log(`API listening on port ${port}`);
    sendSuccess("API has started and is listening for requests.");
});

app.post('/send', async (req, res) => {
    if (!ISREADY) {
        return res.status(503).send('Service Unavailable');
    }

    const { to, content } = req.query;
    if (!to || !content) {
        return res.status(400).send('Missing "to" or "content"');
    }

    ISREADY = false;
    console.log(`Starting temporary WhatsApp client to send message to ${to}`);

    const tempClient = new Client({
        puppeteer: { headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] },
        authStrategy: new LocalAuth({ clientId: "MYID" }), // fixed session
    });

    tempClient.once('ready', async () => {
        try {
            await tempClient.sendMessage(to, content);
            console.log(`✅ Message sent to ${to}`);
            sendSuccess();
            res.status(200).send('Message sent!');
        } catch (err) {
            await logError("Error sending message", err);
            if (!res.headersSent) res.status(500).send('Failed to send message');
        } finally {
            console.log("Cleaning up client...");
            try {
                await tempClient.destroy();
            } catch (err) {
                await logError("Error during client destroy", err);
            }
            ISREADY = true;
        }
    });

    tempClient.once('auth_failure', async (msg) => {
        await logError("Authentication failed", msg);
        if (!res.headersSent) res.status(401).send('Authentication failed');
        try {
            await tempClient.destroy();
        } catch (err) {
            await logError("Error destroying client after auth failure", err);
        }
        ISREADY = true;
    });

    tempClient.once('disconnected', (reason) => {
        console.log("Client disconnected:", reason);
        ISREADY = true;
    });

    // Global error catcher for this client
    tempClient.on('error', async (err) => {
        await logError("Unhandled client error", err);
    });

    // Catch any crashy things
    try {
        tempClient.initialize();
    } catch (err) {
        await logError("Error initializing client", err);
        if (!res.headersSent) res.status(500).send("Failed to initialize client");
        ISREADY = true;
    }
});

// Global process-level crash prevention
process.on("unhandledRejection", (reason, promise) => {
    logError("Unhandled Rejection at Promise", reason);
});
process.on("uncaughtException", (err) => {
    logError("Uncaught Exception thrown", err);
});

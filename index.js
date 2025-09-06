const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const app = express();
const port = 3001;

let ISREADY = true;

app.listen(port, () => {
    console.log(`Example app listening on port ${port}`);
});

app.post('/send', async (req, res) => {
    if (!ISREADY) {
        console.log('Service Unavailable');
        return res.status(503).send('Service Unavailable');
    }

    const { to, content } = req.query;
    if (!to || !content) {
        return res.status(400).send('Missing "to" or "content"');
    }

    console.log(`Sending message to ${to}: ${content}`);

    ISREADY = false;
    const tempClient = new Client({
        puppeteer: { headless: true },
        authStrategy: new LocalAuth({ clientId: "MYID" }),
    });

    tempClient.on('ready', async () => {
        try {
            await tempClient.sendMessage(to, content);
            console.log('Message sent successfully');
            res.status(200).send('Message sent!');
        } catch (e) {
            console.error('Error sending message:', e);
            res.status(400).send(e.toString());
        } finally {
            setTimeout(() => {
                tempClient.destroy();
                ISREADY = true;
            }, 1000);
        }
    });

    tempClient.on('auth_failure', (msg) => {
        res.status(401).send('Authentication failed: ' + msg);
        tempClient.destroy();
        ISREADY = true;
    });

    tempClient.initialize();
});
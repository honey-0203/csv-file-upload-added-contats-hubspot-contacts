const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const csv = require('csv-parser');
const axios = require('axios');
const cors = require('cors');

const app = express();
const port = 3000;

// Multer setup for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, path.join(__dirname, 'uploads')); // Save files in the uploads directory
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname)); // Use a timestamp to prevent name conflicts
  },
});

const upload = multer({ storage });

// Your HubSpot OAuth API token (provided by you)
const HUBSPOT_API_TOKEN = 'pat-na1-eacd4885-4dc9-4756-827a-d22bc25d97';

app.use(cors());
app.use(express.static(__dirname));

// Handle file upload
app.post('/upload', upload.single('csvFile'), (req, res) => {
  if (!req.file) {
    return res.status(400).send('No file uploaded.');
  }

  const filePath = path.join(__dirname, 'uploads', req.file.filename);

  // Array to store parsed contacts
  const contacts = [];

  fs.createReadStream(filePath)
    .pipe(csv())
    .on('data', (row) => {
      // Check if 'email' exists in the row
      if (row.email) {
        contacts.push({
          properties: {
            email: row.email,
            firstname: row.firstname || '', // Ensure lowercase property name
            lastname: row.lastname || '',   // Ensure lowercase property name
          },
        });
      }
    })
    .on('end', async () => {
      if (contacts.length === 0) {
        return res.status(400).send('No valid contacts found in the file.');
      }

      // Log the parsed contacts for debugging
      console.log('Parsed Contacts:', contacts);

      const results = [];
      // Loop through each contact and send it to HubSpot
      for (const contact of contacts) {
        try {
          // Send the contact to HubSpot
          const response = await axios.post(
            `https://api.hubapi.com/crm/v3/objects/contacts`,
            { properties: contact.properties },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${HUBSPOT_API_TOKEN}`,
              },
            }
          );

          console.log(`Contact added: ${contact.properties.email}`);
          results.push({ email: contact.properties.email, status: 'Success' });
        } catch (error) {
          if (error.response?.status === 409) {
            console.log(`Contact already exists: ${contact.properties.email}`);
            results.push({ email: contact.properties.email, status: 'Duplicate' });
          } else {
            console.error(`Error adding contact: ${contact.properties.email}`, error.response?.data);
            results.push({ email: contact.properties.email, status: 'Failed', error: error.response?.data });
          }
        }
      }

      res.send({
        message: 'Contacts processed.',
        results,
      });
    })
    .on('error', (err) => {
      console.error('Error reading CSV file:', err);
      res.status(500).send('Error reading the CSV file.');
    });
});

// Start the server
app.listen(port, () => {
  console.log(`Server running on http://localhost:${port}`);
});

const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { getDB, storagePath } = require('../database');
const { authenticateToken } = require('../middleware/authMiddleware');

router.use(authenticateToken);

// Ensure upload directory exists in App Data storage path
const uploadsDir = path.join(storagePath, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    try {
        fs.mkdirSync(uploadsDir, { recursive: true });
    } catch (err) {
        console.error('Failed to create uploads directory:', err);
    }
}

// Multer storage configuration
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
        cb(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({ storage });

// GET /api/digilocker/:uhid - Get all documents for a patient
router.get('/:uhid', async (req, res) => {
    try {
        const db = await getDB();
        const docs = await db.all(
            'SELECT * FROM patient_documents WHERE uhid = ? ORDER BY created_at DESC',
            [req.params.uhid]
        );
        res.json(docs);
    } catch (e) {
        console.error('Failed to fetch documents:', e);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/digilocker/:uhid/upload - Upload a document for a patient
router.post('/:uhid/upload', upload.single('file'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No file uploaded' });
        }

        const db = await getDB();
        const uhid = req.params.uhid;
        const defaultName = req.file.originalname;
        const customName = defaultName; // Initially same as default
        const filePath = req.file.filename;
        const mimeType = req.file.mimetype;
        const fileSize = req.file.size;

        await db.run(
            `INSERT INTO patient_documents (uhid, default_name, custom_name, file_path, mime_type, file_size)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [uhid, defaultName, customName, filePath, mimeType, fileSize]
        );

        res.json({ message: 'File uploaded successfully', fileName: defaultName });
    } catch (e) {
        console.error('Upload failed:', e);
        res.status(500).json({ error: e.message });
    }
});

// PUT /api/digilocker/document/:id - Update document custom name
router.put('/document/:id', async (req, res) => {
    try {
        const { customName } = req.body;
        if (!customName || customName.trim() === '') {
            return res.status(400).json({ error: 'Filename cannot be empty' });
        }

        const db = await getDB();
        const result = await db.run(
            'UPDATE patient_documents SET custom_name = ? WHERE id = ?',
            [customName.trim(), req.params.id]
        );

        if (result.changes === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json({ message: 'Document updated successfully' });
    } catch (e) {
        console.error('Failed to update document name:', e);
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/digilocker/document/:id - Delete a document
router.delete('/document/:id', async (req, res) => {
    try {
        const db = await getDB();
        const doc = await db.get('SELECT * FROM patient_documents WHERE id = ?', [req.params.id]);

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        // Delete physical file
        const fullPath = path.join(uploadsDir, doc.file_path);
        if (fs.existsSync(fullPath)) {
            try {
                fs.unlinkSync(fullPath);
            } catch (err) {
                console.error(`Failed to delete physical file: ${fullPath}`, err);
            }
        }

        // Delete database record
        await db.run('DELETE FROM patient_documents WHERE id = ?', [req.params.id]);

        res.json({ message: 'Document deleted successfully' });
    } catch (e) {
        console.error('Failed to delete document:', e);
        res.status(500).json({ error: e.message });
    }
});

// GET /api/digilocker/document/:id/view - View/stream document
router.get('/document/:id/view', async (req, res) => {
    try {
        const db = await getDB();
        const doc = await db.get('SELECT * FROM patient_documents WHERE id = ?', [req.params.id]);

        if (!doc) {
            return res.status(404).json({ error: 'Document not found' });
        }

        const fullPath = path.join(uploadsDir, doc.file_path);
        if (!fs.existsSync(fullPath)) {
            return res.status(404).json({ error: 'Physical file not found' });
        }

        // Set content type and inline disposition so browser tries to render it directly if possible
        res.setHeader('Content-Type', doc.mime_type || 'application/octet-stream');
        res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.custom_name)}"`);
        
        res.sendFile(fullPath);
    } catch (e) {
        console.error('Failed to retrieve file:', e);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

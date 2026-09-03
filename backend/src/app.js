const express = require('express');
const authRoutes = require('./routes/authRoutes');
const permisoRoutes = require('./routes/permisoRoutes');

const app = express();

app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/auth', authRoutes);
app.use('/api/permisos', permisoRoutes);

module.exports = app;
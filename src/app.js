const express = require('express');
const accountsRoutes = require('./routes/accounts.routes');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');

const app = express();
app.use(express.json());
app.use('/accounts', accountsRoutes);
const transfersRoutes = require('./routes/transfers.routes');
app.use('/transfers', transfersRoutes);
app.use(notFoundHandler);   // routes ke baad
app.use(errorHandler);      // sabse last

module.exports = app;
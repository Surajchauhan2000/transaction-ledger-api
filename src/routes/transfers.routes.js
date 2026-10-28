const router = require('express').Router();
const c = require('../controllers/transfers.controller');
const validate = require('../middleware/validate');
const { transferSchema } = require('../validators/schemas');

router.post('/', validate(transferSchema), c.createTransfer);

module.exports = router;
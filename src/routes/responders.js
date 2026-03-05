const express = require('express');
const router = express.Router();
const {
  getAllResponders,
  verifyResponder,
  unverifyResponder,
  updateSpecialization,
  deleteResponder
} = require('../controllers/responderController');
const { protect, adminOnly } = require('../middleware/auth');

router.get('/', protect, adminOnly, getAllResponders);
router.put('/:id/verify', protect, adminOnly, verifyResponder);
router.put('/:id/unverify', protect, adminOnly, unverifyResponder);
router.put('/:id/specialization', protect, adminOnly, updateSpecialization);
router.delete('/:id', protect, adminOnly, deleteResponder);

module.exports = router;
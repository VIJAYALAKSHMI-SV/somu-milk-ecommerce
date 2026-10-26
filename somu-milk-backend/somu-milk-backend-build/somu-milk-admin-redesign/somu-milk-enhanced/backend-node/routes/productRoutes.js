
const express = require("express");
const router = express.Router();

const {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
} = require("../controllers/productController");

const { protectAdmin } = require("../middleware/authMiddleware");

// Public routes: anyone can view products
router.get("/", getProducts);
router.get("/:id", getProductById);

// Protected routes: admin login required
router.post("/", protectAdmin, createProduct);
router.put("/:id", protectAdmin, updateProduct);
router.delete("/:id", protectAdmin, deleteProduct);

module.exports = router;

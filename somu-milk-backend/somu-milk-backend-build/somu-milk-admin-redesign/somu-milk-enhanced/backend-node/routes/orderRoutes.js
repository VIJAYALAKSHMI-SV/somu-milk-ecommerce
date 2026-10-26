
const express = require("express");
const router = express.Router();

const {
  placeOrder,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
} = require("../controllers/orderController");

const {
  protectCustomer,
} = require("../middleware/customerAuthMiddleware");

const {
  protectAdmin,
} = require("../middleware/authMiddleware");

// Customer routes
router.post("/", protectCustomer, placeOrder);
router.get("/my-orders", protectCustomer, getMyOrders);

// Admin routes
router.get("/", protectAdmin, getAllOrders);
router.get("/:id", protectAdmin, getOrderById);
router.patch("/:id/status", protectAdmin, updateOrderStatus);

module.exports = router;

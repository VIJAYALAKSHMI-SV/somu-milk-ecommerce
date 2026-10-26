
const mongoose = require("mongoose");
const Cart = require("../models/Cart");
const Product = require("../models/Product");
const Order = require("../models/Order");

const ORDER_STATUSES = [
  "Pending",
  "Confirmed",
  "Out for Delivery",
  "Delivered",
  "Cancelled",
];

// Place an order from the customer's cart
const placeOrder = async (req, res) => {
  let session;

  try {
    const { deliveryAddress } = req.body;

    if (
      typeof deliveryAddress !== "string" ||
      !deliveryAddress.trim()
    ) {
      return res.status(400).json({
        success: false,
        message: "Delivery address is required.",
      });
    }

    session = await mongoose.startSession();
    let createdOrderId;

    await session.withTransaction(async () => {
      const cart = await Cart.findOne({
        customer: req.customer.id,
      }).session(session);

      if (!cart || cart.items.length === 0) {
        const error = new Error("Your cart is empty.");
        error.statusCode = 400;
        throw error;
      }

      const orderItems = [];
      let subtotal = 0;

      for (const cartItem of cart.items) {
        const product = await Product.findById(
          cartItem.product
        ).session(session);

        if (!product || product.isAvailable === false) {
          const error = new Error(
            "A product in your cart is unavailable."
          );
          error.statusCode = 400;
          throw error;
        }

        if (
          !Number.isInteger(cartItem.quantity) ||
          cartItem.quantity < 1 ||
          cartItem.quantity > product.stock
        ) {
          const error = new Error(
            `Insufficient stock for ${product.name}.`
          );
          error.statusCode = 400;
          throw error;
        }

        const itemSubtotal = Math.round(
          (product.price * cartItem.quantity + Number.EPSILON) * 100
        ) / 100;

        subtotal = Math.round(
          (subtotal + itemSubtotal + Number.EPSILON) * 100
        ) / 100;

        orderItems.push({
          product: product._id,
          name: product.name,
          quantity: cartItem.quantity,
          unit: product.unit,
          price: product.price,
          subtotal: itemSubtotal,
        });

        const stockUpdate = await Product.updateOne(
          {
            _id: product._id,
            stock: { $gte: cartItem.quantity },
            isAvailable: { $ne: false },
          },
          { $inc: { stock: -cartItem.quantity } },
          { session }
        );

        if (stockUpdate.modifiedCount !== 1) {
          const error = new Error(
            `Stock changed while ordering ${product.name}. Please try again.`
          );
          error.statusCode = 409;
          throw error;
        }
      }

      // Existing delivery policy: free delivery.
      const deliveryFee = 0;
      const totalAmount = Math.round(
        (subtotal + deliveryFee + Number.EPSILON) * 100
      ) / 100;

      const orders = await Order.create(
        [{
          customer: req.customer.id,
          items: orderItems,
          deliveryAddress: deliveryAddress.trim(),
          subtotal,
          deliveryFee,
          totalAmount,
          status: "Pending",
        }],
        { session }
      );

      createdOrderId = orders[0]._id;

      cart.items = [];
      await cart.save({ session });
    });

    const order = await Order.findById(createdOrderId)
      .populate("customer", "name email phone");

    return res.status(201).json({
      success: true,
      message: "Order placed successfully.",
      order,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Place order error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to place order.",
    });
  } finally {
    if (session) await session.endSession();
  }
};

// Customer: view only their own orders
const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({
      customer: req.customer.id,
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get customer orders error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve orders.",
    });
  }
};

// Admin: view all orders, newest first
const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.find()
      .populate("customer", "name email phone")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      count: orders.length,
      orders,
    });
  } catch (error) {
    console.error("Get all orders error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve orders.",
    });
  }
};

// Admin: view one order
const getOrderById = async (req, res) => {
  try {
    const { id } = req.params;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    const order = await Order.findById(id)
      .populate("customer", "name email phone");

    if (!order) {
      return res.status(404).json({
        success: false,
        message: "Order not found.",
      });
    }

    return res.json({ success: true, order });
  } catch (error) {
    console.error("Get order error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to retrieve order.",
    });
  }
};

// Admin: update status or cancel safely
const updateOrderStatus = async (req, res) => {
  let session;

  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order ID.",
      });
    }

    if (!ORDER_STATUSES.includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Invalid order status.",
        allowedStatuses: ORDER_STATUSES,
      });
    }

    session = await mongoose.startSession();
    let updatedOrderId;

    await session.withTransaction(async () => {
      const order = await Order.findById(id).session(session);

      if (!order) {
        const error = new Error("Order not found.");
        error.statusCode = 404;
        throw error;
      }

      if (order.status === status) {
        updatedOrderId = order._id;
        return;
      }

      if (
        order.status === "Cancelled" ||
        order.status === "Delivered"
      ) {
        const error = new Error(
          `A ${order.status.toLowerCase()} order cannot be changed.`
        );
        error.statusCode = 409;
        throw error;
      }

      const allowedTransitions = {
        Pending: ["Confirmed", "Cancelled"],
        Confirmed: ["Out for Delivery", "Cancelled"],
        "Out for Delivery": ["Delivered"],
      };

      if (
        !allowedTransitions[order.status]?.includes(status)
      ) {
        const error = new Error(
          `Cannot change order status from ${order.status} to ${status}.`
        );
        error.statusCode = 409;
        throw error;
      }

      // Restore stock only when a Pending or Confirmed order
      // is cancelled. The transaction prevents partial updates.
      if (status === "Cancelled") {
        for (const item of order.items) {
          const result = await Product.updateOne(
            { _id: item.product },
            { $inc: { stock: item.quantity } },
            { session }
          );

          if (result.matchedCount !== 1) {
            const error = new Error(
              `Cannot restore stock for ${item.name}; product not found.`
            );
            error.statusCode = 409;
            throw error;
          }
        }
      }

      order.status = status;
      await order.save({ session });

      updatedOrderId = order._id;
    });

    const updatedOrder = await Order.findById(updatedOrderId)
      .populate("customer", "name email phone");

    return res.json({
      success: true,
      message: "Order status updated successfully.",
      order: updatedOrder,
    });
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        success: false,
        message: error.message,
      });
    }

    console.error("Update order status error:", error.message);

    return res.status(500).json({
      success: false,
      message: "Failed to update order status.",
    });
  } finally {
    if (session) await session.endSession();
  }
};

module.exports = {
  placeOrder,
  getMyOrders,
  getAllOrders,
  getOrderById,
  updateOrderStatus,
};

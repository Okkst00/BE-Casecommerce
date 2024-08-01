const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");

const connection = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "casecommerce",
});

const app = express();

const port = 4000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

connection.connect((err) => {
  if (err) {
    console.error("Kesalahan koneksi:", err.stack);
    return;
  }
  console.log("Terhubung dengan database MySQL dengan id", connection.threadId);
});

app.use(cors());

// Routes
app.get("/", (req, res) => {
  res.send("API is working");
});

app.get("/categories", (req, res) => {
  const SELECT_QUERY = "SELECT id, name FROM product_category";
  connection.query(SELECT_QUERY, (error, results) => {
    if (error) {
      console.error("Kesalahan query:", error.stack);
      res
        .status(500)
        .json({ error: "Terjadi kesalahan saat mengambil data dari database" });
      return;
    }
    res.status(200).json(results);
  });
});

// server.js (atau file yang sesuai untuk server Anda)
app.get("/products/category/:categoryId", (req, res) => {
  const categoryId = req.params.categoryId;

  const SELECT_QUERY = `
    SELECT p.id, p.name, p.description, p.price, p.stock
    FROM product p
    WHERE p.category_id = ?
  `;

  connection.query(SELECT_QUERY, [categoryId], (error, results) => {
    if (error) {
      console.error("Kesalahan query:", error.stack);
      return res
        .status(500)
        .json({ error: "Terjadi kesalahan saat mengambil data produk" });
    }
    res.status(200).json(results);
  });
});

app.post("/products", (req, res) => {
  const { name, description, price, stock, category_id } = req.body;
  const INSERT_QUERY = `INSERT INTO product (name, description, price, stock, category_id) VALUES (?, ?, ?, ?, ?)`;
  connection.query(
    INSERT_QUERY,
    [name, description, price, stock, category_id],
    (error, results) => {
      if (error) {
        console.error("Kesalahan query:", error.stack);
        res.status(500).json({
          error: "Terjadi kesalahan saat menambahkan data ke database",
        });
        return;
      }
      res
        .status(201)
        .json({ message: "Data berhasil ditambahkan", id: results.insertId });
    }
  );
});

app.get("/products", (req, res) => {
  const query = `
    SELECT p.*, c.name AS category_name
    FROM product p
    LEFT JOIN product_category c ON p.category_id = c.id
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Query error:", error);
      res.status(500).json({ error: "Database query error" });
      return;
    }
    res.json(results);
  });
});

app.get("/products/:id", (req, res) => {
  let sql = "SELECT * FROM product WHERE product_id = ?";
  connection.query(sql, [req.params.id], (err, result) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).send({ error: "Database query failed" });
      return;
    }

    if (result.length === 0) {
      res.status(404).send({ error: "Product not found" });
      return;
    }

    res.send(result[0]);
  });
});

app.put("/products/:id", (req, res) => {
  let product = req.body;
  let sql = `UPDATE product SET ? WHERE product_id = ${req.params.id}`;
  connection.query(sql, product, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.delete("/products/:id", (req, res) => {
  const sql = `DELETE FROM product WHERE product_id = ?`;
  const params = [req.params.id];

  connection.query(sql, params, (err, result) => {
    if (err) {
      return res.status(500).json({ error: err.message });
    }
    res.send(result);
  });
});

app.post("/cart", (req, res) => {
  const { userId, productId, quantity } = req.body;

  // Check if the cart exists for the user, if not create one
  let sql = "SELECT cart_id FROM cart WHERE user_id = ?";
  connection.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).send({ error: "Database query failed" });
      return;
    }

    let cartId;

    if (result.length === 0) {
      // No cart exists, create a new one
      let insertCartSql = "INSERT INTO cart (user_id) VALUES (?)";
      connection.query(insertCartSql, [userId], (err, result) => {
        if (err) {
          console.error("Error executing query:", err);
          res.status(500).send({ error: "Database query failed" });
          return;
        }

        cartId = result.insertId;
        addCartItem(cartId);
      });
    } else {
      cartId = result[0].cart_id;
      addCartItem(cartId);
    }
  });

  const addCartItem = (cartId) => {
    // Check if the product already exists in the cart
    let checkCartItemSql =
      "SELECT * FROM cart_item WHERE cart_id = ? AND product_id = ?";
    connection.query(checkCartItemSql, [cartId, productId], (err, result) => {
      if (err) {
        console.error("Error executing query:", err);
        res.status(500).send({ error: "Database query failed" });
        return;
      }

      if (result.length > 0) {
        // Product exists in cart, update quantity
        let updateCartItemSql =
          "UPDATE cart_item SET quantity = quantity + ? WHERE cart_id = ? AND product_id = ?";
        connection.query(
          updateCartItemSql,
          [quantity, cartId, productId],
          (err, result) => {
            if (err) {
              console.error("Error executing query:", err);
              res.status(500).send({ error: "Database query failed" });
              return;
            }

            // Retrieve updated cart item to ensure correctness
            connection.query(
              checkCartItemSql,
              [cartId, productId],
              (err, updatedResult) => {
                if (err) {
                  console.error("Error executing query:", err);
                  res.status(500).send({ error: "Database query failed" });
                  return;
                }

                res.send(updatedResult[0]); // Send updated item details
              }
            );
          }
        );
      } else {
        // Product does not exist in cart, insert new cart item
        let insertCartItemSql =
          "INSERT INTO cart_item (cart_id, product_id, quantity) VALUES (?, ?, ?)";
        connection.query(
          insertCartItemSql,
          [cartId, productId, quantity],
          (err, result) => {
            if (err) {
              console.error("Error executing query:", err);
              res.status(500).send({ error: "Database query failed" });
              return;
            }

            // Retrieve newly added cart item to ensure correctness
            connection.query(
              checkCartItemSql,
              [cartId, productId],
              (err, updatedResult) => {
                if (err) {
                  console.error("Error executing query:", err);
                  res.status(500).send({ error: "Database query failed" });
                  return;
                }

                res.send(updatedResult[0]); // Send new item details
              }
            );
          }
        );
      }
    });
  };
});

app.get("/cart/:userId", (req, res) => {
  const userId = req.params.userId;

  // Query untuk mendapatkan cart_id berdasarkan userId
  let sql = `
    SELECT cart_id FROM cart WHERE user_id = ?
  `;

  connection.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).send({ error: "Database query failed" });
      return;
    }

    if (result.length === 0) {
      return res.status(404).send({ message: "Cart not found for user" });
    }

    const cartId = result[0].cart_id;

    // Query untuk mendapatkan items di cart bersama dengan detail produk dan kategori
    sql = `
      SELECT ci.cart_item_id, ci.product_id, ci.quantity, p.name, p.description, p.price, p.stock, c.name AS category_name
      FROM cart_item ci
      JOIN product p ON ci.product_id = p.product_id
      LEFT JOIN product_category c ON p.category_id = c.id
      WHERE ci.cart_id = ?
    `;

    connection.query(sql, [cartId], (err, result) => {
      if (err) {
        console.error("Error executing query:", err);
        res.status(500).send({ error: "Database query failed" });
        return;
      }

      if (result.length === 0) {
        res.status(404).send({ message: "No items found in cart" });
      } else {
        res.send(result);
      }
    });
  });
});

app.delete("/cart", (req, res) => {
  const { userId, productId } = req.body;

  let sql = `
      DELETE ci FROM cart_item ci
      JOIN cart c ON ci.cart_id = c.cart_id
      WHERE c.user_id = ? AND ci.product_id = ?
    `;
  connection.query(sql, [userId, productId], (err, result) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).send({ error: "Database query failed" });
      return;
    }

    res.send({ message: "Product removed from cart" });
  });
});

app.put("/carts/:id", (req, res) => {
  let cart = req.body;
  let sql = `UPDATE cart SET ? WHERE cart_id = ${req.params.id}`;
  db.query(sql, cart, (err, result) => {
    if (err) throw err;
    res.send(result);
  });
});

app.post("/orders", (req, res) => {
  const { user_id, total_price, status, items } = req.body;
  console.log("Received order data:", { user_id, total_price, status, items });

  if (!user_id || !total_price || !status || !items || items.length === 0) {
    return res.status(400).json({ error: "Missing required fields or items" });
  }

  const sql = `INSERT INTO orders (user_id, total_price, status) VALUES (?, ?, ?)`;
  connection.query(sql, [user_id, total_price, status], (error, result) => {
    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Database error" });
    }
    const orderId = result.insertId;

    // Insert items into order_items table
    const orderItemsSql = `INSERT INTO order_items (order_id, product_id, quantity, price) VALUES ?`;
    const orderItemsValues = items.map((item) => [
      orderId,
      item.product_id,
      item.quantity,
      item.price,
    ]);

    connection.query(orderItemsSql, [orderItemsValues], (error) => {
      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({ error: "Database error" });
      }

      res.status(201).json({ order_id: orderId, user_id, total_price, status });
    });
  });
});

app.get("/orders", (req, res) => {
  const { user_id } = req.query;

  const ordersSql = `SELECT * FROM orders WHERE user_id = ?`;
  connection.query(ordersSql, [user_id], (error, orders) => {
    if (error) {
      console.error("Database error:", error);
      return res.status(500).json({ error: "Database error" });
    }

    // Fetch order items and product names
    const orderItemsSql = `SELECT order_items.order_id, order_items.product_id, order_items.quantity, order_items.price, product.name as product_name 
                           FROM order_items
                           JOIN product ON order_items.product_id = product.product_id
                           WHERE order_items.order_id IN (${orders
                             .map((order) => order.order_id)
                             .join(",")})`;

    connection.query(orderItemsSql, (error, orderItems) => {
      if (error) {
        console.error("Database error:", error);
        return res.status(500).json({ error: "Database error" });
      }

      // Group order items by order_id
      const ordersWithItems = orders.map((order) => {
        return {
          ...order,
          items: orderItems.filter((item) => item.order_id === order.order_id),
        };
      });

      res.status(200).json(ordersWithItems);
    });
  });
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});

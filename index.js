const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");

const connection = mysql.createConnection({
  host: "localhost", // Ganti dengan host database Anda
  user: "root", // Ganti dengan username database Anda
  password: "", // Ganti dengan password database Anda
  database: "casecommerce", // Ganti dengan nama database Anda
});

const app = express();

const port = 4000;

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Menghubungkan ke database MySQL
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

// Product Routes
app.post("/products", (req, res) => {
  const { name, description, price, stock } = req.body;
  const INSERT_QUERY = `INSERT INTO product (name, description, price, stock) VALUES (?, ?, ?, ?)`;
  connection.query(
    INSERT_QUERY,
    [name, description, price, stock],
    (error, results, fields) => {
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
  const sql = "SELECT * FROM product";
  connection.query(sql, (err, results) => {
    if (err) {
      res.status(500).json({ error: err.message });
    } else {
      res.json(results);
    }
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

// Add product to cart
app.post("/cart", (req, res) => {
  const { userId, productId, quantity } = req.body;

  // Check if the cart exists for the user, if not create one
  let sql = "SELECT * FROM cart WHERE user_id = ?";
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

            res.send({ message: "Product quantity updated in cart" });
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

            res.send({ message: "Product added to cart" });
          }
        );
      }
    });
  };
});

// Get cart items
app.get("/cart/:userId", (req, res) => {
  const userId = req.params.userId;

  let sql = `
      SELECT p.product_id, p.name, p.description, p.price, ci.quantity
      FROM cart_item ci
      JOIN cart c ON ci.cart_id = c.cart_id
      JOIN product p ON ci.product_id = p.product_id
      WHERE c.user_id = ?
    `;
  connection.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error executing query:", err);
      res.status(500).send({ error: "Database query failed" });
      return;
    }

    res.send(result);
  });
});

// Delete product from cart
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

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});

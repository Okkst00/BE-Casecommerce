const express = require("express");
const mysql = require("mysql");
const bodyParser = require("body-parser");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const { isAuthenticated, hasRole } = require("./middlewares/auth");
const authenticateUser = require("./middlewares/authUser");

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

app.use(
  cors({
    origin: "http://localhost:3000", // Ubah dengan URL frontend Anda
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use((req, res, next) => {
  console.log("Request headers:", req.headers); // Log semua header
  next();
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/"); // Tempat penyimpanan file
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = Date.now() + ext;
    cb(null, filename);
  },
});

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadDir = "uploads/";
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir);
      }
      cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
      cb(null, Date.now() + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 }, // Maksimal ukuran file 10MB
});

app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.get("/categories", isAuthenticated, hasRole("admin"), (req, res) => {
  console.log("User role:", req.user.role);

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

app.post("/register", (req, res) => {
  const { username, password, role } = req.body;

  bcrypt.hash(password, 10, (err, hashedPassword) => {
    if (err) {
      return res.status(500).json({ error: "Hashing failed" });
    }

    const query =
      "INSERT INTO users (username, password, role) VALUES (?, ?, ?)";
    connection.query(query, [username, hashedPassword, role], (error) => {
      if (error) {
        return res.status(500).json({ error: "Database error" });
      }
      res.status(201).json({ message: "User registered successfully" });
    });
  });
});

app.post("/login", (req, res) => {
  const { email, password } = req.body;

  const query = "SELECT * FROM users WHERE email = ?";
  connection.query(query, [email], async (err, results) => {
    if (err) {
      console.error("Database query error:", err);
      return res.status(500).json({ message: "Database query error" });
    }

    if (results.length === 0) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const user = results[0];
    try {
      const isMatch = await bcrypt.compare(password, user.password);

      if (!isMatch) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Generate token JWT
      const token = jwt.sign(
        { id: user.id, email: user.email, role: user.role },
        "your_jwt_secret_key",
        { expiresIn: "1h" }
      );

      res.status(200).json({ token, userId: user.id }); // Mengirimkan userId dalam respons
    } catch (error) {
      console.error("Error comparing passwords or generating token:", error);
      res.status(500).json({ message: "Internal server error" });
    }
  });
});

app.get("/user/:id", (req, res) => {
  const userId = req.params.id;

  const query = "SELECT username, email FROM users WHERE id = ?";
  connection.query(query, [userId], (err, results) => {
    if (err) {
      console.error("Database query error:", err); // Log detail error
      return res.status(500).json({ message: "Database query error" });
    }

    if (results.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }

    const user = results[0];
    res.status(200).json({ name: user.username, email: user.email });
  });
});

app.get("/", (req, res) => {
  res.send("API is working");
});

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

app.post("/products", upload.array("images", 10), (req, res) => {
  const { name, description, price, stock, category_id } = req.body;
  const imagePaths = req.files.map((file) => file.path);

  // Query untuk memasukkan data produk
  const INSERT_PRODUCT_QUERY = `
    INSERT INTO product (name, description, price, stock, category_id) VALUES (?, ?, ?, ?, ?)
  `;

  connection.query(
    INSERT_PRODUCT_QUERY,
    [name, description, price, stock, category_id],
    (error, results) => {
      if (error) {
        console.error("Kesalahan query produk:", error.stack);
        res.status(500).json({
          error: "Terjadi kesalahan saat menambahkan data produk ke database",
        });
        return;
      }

      const productId = results.insertId;

      // Query untuk memasukkan data gambar
      const INSERT_IMAGE_QUERY = `
        INSERT INTO product_images (product_id, image_url) 
        VALUES ?
      `;

      const imageValues = imagePaths.map((path) => [productId, path]);

      connection.query(INSERT_IMAGE_QUERY, [imageValues], (error) => {
        if (error) {
          console.error("Kesalahan query gambar:", error.stack);
          res.status(500).json({
            error: "Terjadi kesalahan saat menambahkan gambar ke database",
          });
          return;
        }

        // Update image_url di tabel product
        const UPDATE_PRODUCT_QUERY = `
          UPDATE product
          SET image_url = ?
          WHERE product_id = ?
        `;

        // Ambil URL gambar pertama sebagai contoh (jika lebih dari satu gambar, bisa diubah sesuai kebutuhan)
        const firstImageUrl = imagePaths[0];

        connection.query(
          UPDATE_PRODUCT_QUERY,
          [firstImageUrl, productId],
          (error) => {
            if (error) {
              console.error("Kesalahan query update produk:", error.stack);
              res.status(500).json({
                error:
                  "Terjadi kesalahan saat memperbarui data produk di database",
              });
              return;
            }

            res.status(201).json({
              message: "Produk dan gambar berhasil ditambahkan",
              id: productId,
            });
          }
        );
      });
    }
  );
});

// Memastikan direktori uploads ada
if (!fs.existsSync("uploads")) {
  fs.mkdirSync("uploads");
}

app.get("/products", (req, res) => {
  const query = `
    SELECT p.*, c.name AS category_name, GROUP_CONCAT(pi.image_url) AS image_urls
    FROM product p
    LEFT JOIN product_category c ON p.category_id = c.id
    LEFT JOIN product_images pi ON p.product_id = pi.product_id
    GROUP BY p.product_id
  `;

  connection.query(query, (error, results) => {
    if (error) {
      console.error("Query error:", error);
      res.status(500).json({ error: "Database query error" });
      return;
    }

    // Format the results to split the image URLs
    const products = results.map((product) => {
      product.image_urls = product.image_urls
        ? product.image_urls.split(",")
        : [];
      return product;
    });

    res.json(products);
  });
});

app.get("/products/:id", (req, res) => {
  const query = `
    SELECT p.*, c.name AS category_name, GROUP_CONCAT(pi.image_url) AS image_urls
    FROM product p
    LEFT JOIN product_category c ON p.category_id = c.id
    LEFT JOIN product_images pi ON p.product_id = pi.product_id
    WHERE p.product_id = ?
    GROUP BY p.product_id
  `;

  connection.query(query, [req.params.id], (error, results) => {
    if (error) {
      console.error("Error executing query:", error);
      res.status(500).send({ error: "Database query failed" });
      return;
    }

    if (results.length === 0) {
      res.status(404).send({ error: "Product not found" });
      return;
    }

    // Format the result to split the image URLs
    const product = results[0];
    product.image_urls = product.image_urls
      ? product.image_urls.split(",")
      : [];

    res.json(product);
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

app.post("/cart", authenticateUser, (req, res) => {
  const { productId, quantity } = req.body;
  const userId = req.user.id;
  // Validasi input
  if (!userId || !productId || typeof quantity !== "number" || quantity <= 0) {
    return res.status(400).send({ error: "Invalid input" });
  }

  // Check if the cart exists for the user, if not create one
  let sql = "SELECT cart_id FROM cart WHERE user_id = ?";
  connection.query(sql, [userId], (err, result) => {
    if (err) {
      console.error("Error executing query:", err);
      return res.status(500).send({ error: "Database query failed" });
    }

    let cartId;

    if (result.length === 0) {
      // No cart exists, create a new one
      let insertCartSql = "INSERT INTO cart (user_id) VALUES (?)";
      connection.query(insertCartSql, [userId], (err, result) => {
        if (err) {
          console.error("Error executing query:", err);
          return res.status(500).send({ error: "Database query failed" });
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
        return res.status(500).send({ error: "Database query failed" });
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
              return res.status(500).send({ error: "Database query failed" });
            }

            // Retrieve updated cart item to ensure correctness
            connection.query(
              checkCartItemSql,
              [cartId, productId],
              (err, updatedResult) => {
                if (err) {
                  console.error("Error executing query:", err);
                  return res
                    .status(500)
                    .send({ error: "Database query failed" });
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
              return res.status(500).send({ error: "Database query failed" });
            }

            // Retrieve newly added cart item to ensure correctness
            connection.query(
              checkCartItemSql,
              [cartId, productId],
              (err, updatedResult) => {
                if (err) {
                  console.error("Error executing query:", err);
                  return res
                    .status(500)
                    .send({ error: "Database query failed" });
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

// Endpoint untuk mendapatkan detail kategori berdasarkan ID
app.get("/categories/:id", (req, res) => {
  const categoryId = req.params.id;

  // Query untuk mengambil detail kategori berdasarkan ID
  const query = "SELECT * FROM product_category WHERE id = ?";

  connection.query(query, [categoryId], (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: "Database query failed" });
    }

    // Jika kategori tidak ditemukan, kembalikan status 404
    if (results.length === 0) {
      return res.status(404).json({ error: "Category not found" });
    }

    // Kembalikan hasil (detail kategori)
    res.status(200).json(results[0]);
  });
});

app.get("/category/:id/products", (req, res) => {
  const categoryId = req.params.id;
  const query = "SELECT * FROM product WHERE category_id = ?";

  connection.query(query, [categoryId], (err, results) => {
    if (err) {
      console.error("Database query failed:", err);
      return res.status(500).json({ error: "Database query failed" });
    }
    // Selalu kembalikan status 200 dan array, meskipun tidak ada produk
    res.status(200).json(results);
  });
});

app.listen(port, () => {
  console.log(`Server berjalan di http://localhost:${port}`);
});

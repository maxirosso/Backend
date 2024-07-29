require('dotenv').config();
const express = require('express');
const app = express();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const cors = require('cors');
const bcrypt = require('bcrypt');
const cloudinary = require('cloudinary').v2;
const { CloudinaryStorage } = require('multer-storage-cloudinary');
const { MercadoPagoConfig, Payment } = require('mercadopago');

const port = process.env.PORT || 4000;

app.use(express.json());
app.use(cors());

// Cloudinary configuration
cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET
});

// Database connection with MongoDB
mongoose.connect(process.env.MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.log(err));

// Cloudinary storage configuration for multer
const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'product_images',
        public_id: (req, file) => file.fieldname + '_' + Date.now(),
    },
});

const upload = multer({ storage: storage });

// Mercado Pago configuration
const client = new MercadoPagoConfig({ accessToken: process.env.MERCADO_PAGO_ACCESS_TOKEN });
const payment = new Payment(client);

app.get("/", (req, res) => {
    res.send("Express App is running");
});

// Create Upload endpoint for images
app.post("/upload", upload.single('product'), (req, res) => {
    res.json({
        success: 1,
        image_url: req.file.path // Cloudinary URL
    });
});

// Schema for creating products
const Product = mongoose.model("Product", {
    id: {
        type: Number,
        required: true
    },
    name: {
        type: String,
        required: true
    },
    image: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true
    },
    new_price: {
        type: Number,
        required: true
    },
    old_price: {
        type: Number,
        required: true
    },
    date: {
        type: Date,
        default: Date.now
    },
    available: {
        type: Boolean,
        default: true
    },
    description: {
        type: String,
        required: true
    },
    sizes: {
        type: [String], // Array to store sizes
        required: true
    }
});

app.post('/addproduct', async (req, res) => {
    let products = await Product.find({});
    let id;
    if (products.length > 0) {
        let last_product_array = products.slice(-1);
        let last_product = last_product_array[0];
        id = last_product.id + 1;
    } else {
        id = 1;
    }
    const product = new Product({
        id: id,
        name: req.body.name,
        image: req.body.image, // Full Cloudinary URL is stored
        category: req.body.category,
        new_price: req.body.new_price,
        old_price: req.body.old_price,
        description: req.body.description,
        sizes: req.body.sizes // Pass sizes here
    });
    console.log(product);
    await product.save();
    console.log("Saved");
    res.json({
        success: 1,
        name: req.body.name
    });
});

// Creating API for deleting products
app.post('/removeproduct', async (req, res) => {
    await Product.findOneAndDelete({ id: req.body.id });
    console.log("Removed");
    res.json({
        success: true,
        name: req.body.name
    });
});

// Creating API for getting all products
app.get('/allproducts', async (req, res) => {
    let products = await Product.find({});
    console.log("All Products Fetched");
    res.send(products);
});

// Schema creating for User model
const Users = mongoose.model('Users', {
    name: {
        type: String,
    },
    email: {
        type: String,
        unique: true,
    },
    password: {
        type: String,
    },
    address: {
        type: String, // Add address field
        required: false
    },
    cartData: {
        type: Map,
        of: Object,
    },
    date: {
        type: Date,
        default: Date.now
    }
});

// Creating Endpoint for registering the user
app.post('/signup', async (req, res) => {
    let check = await Users.findOne({ email: req.body.email });
    if (check) {
        return res.status(400).json({ success: false, errors: "Existing user found with same Email address" });
    }

    let cart = {};
    for (let i = 0; i < 300; i++) {
        cart[i] = 0;
    }

    const hashedPassword = await bcrypt.hash(req.body.password, 10);

    const user = new Users({
        name: req.body.name,
        email: req.body.email,
        password: hashedPassword,
        address: req.body.address, // Save address here
        cartData: cart
    });

    await user.save();

    const data = {
        user: {
            id: user.id
        }
    };

    const token = jwt.sign(data, process.env.JWT_SECRET);
    res.json({ success: true, token });
});

// Creating endpoint for user login
app.post('/login', async (req, res) => {
    let user = await Users.findOne({ email: req.body.email });
    if (user) {
        const passCompare = await bcrypt.compare(req.body.password, user.password);
        if (passCompare) {
            const data = {
                user: {
                    id: user.id
                }
            };
            const token = jwt.sign(data, process.env.JWT_SECRET);
            res.json({ success: true, token });
        } else {
            res.json({ success: false, errors: "Wrong Password" });
        }
    } else {
        res.json({ success: false, errors: "Wrong Email Id" });
    }
});

// Creating Endpoint for new collection data
app.get('/newcollections', async (req, res) => {
    let products = await Product.find({});
    let newcollection = products.slice(1).slice(-8);
    console.log("NewCollection Fetched");
    res.send(newcollection);
});

// Creating Endpoint for related products data
app.get('/relatedproducts/:id', async (req, res) => {
    try {
        // Define a fixed set of product IDs that you want to always show
        const fixedProductIds = [1, 2, 3, 4]; // Replace with actual product IDs

        // Fetch these products from the database
        const relatedProducts = await Product.find({ id: { $in: fixedProductIds } });

        if (relatedProducts.length === 0) {
            return res.status(404).send({ error: "Related products not found" });
        }

        console.log("Fixed related products fetched:", relatedProducts);
        res.send(relatedProducts);
    } catch (error) {
        console.error("Error fetching related products:", error);
        res.status(500).send('Server Error');
    }
});

// Creating endpoint for popular in women section 
app.get('/popularinwomen', async (req, res) => {
    let products = await Product.find({ category: "women" });
    let popular_in_women = products.slice(0, 4);
    console.log("Popular in women fetched");
    res.send(popular_in_women);
});

// Creating middleware to fetch user
const fetchUser = async (req, res, next) => {
    const token = req.header('auth-token');
    if (!token) {
        return res.status(401).send({ errors: "Please Authenticate using valid token" });
    } else {
        try {
            const data = jwt.verify(token, process.env.JWT_SECRET);
            req.user = data.user;
            next();
        } catch (error) {
            res.status(401).send({ errors: "Please Authenticate using valid token" });
        }
    }
};

// Creating endpoint for adding products to cartdata
app.post('/addtocart', fetchUser, async (req, res) => {
    console.log("Added", req.body.itemId);
    let userData = await Users.findOne({ _id: req.user.id });
    userData.cartData[req.body.itemId] += 1;
    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("Added");
});

   // Creating endpoint for removing products from cartdata
   app.post('/removefromcart', fetchUser, async (req, res) => {
    console.log("removed", req.body.itemId);
    let userData = await Users.findOne({ _id: req.user.id });
    if (userData.cartData[req.body.itemId] > 0) {
        userData.cartData[req.body.itemId] -= 1;
    }
    await Users.findOneAndUpdate({ _id: req.user.id }, { cartData: userData.cartData });
    res.send("Removed");
});

// Creating endpoint to get cartdata
app.get('/getcart', fetchUser, async (req, res) => {
    try {
        console.log("GetCart");
        let userData = await Users.findOne({ _id: req.user.id });
        res.json(userData.cartData);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server Error');
    }
});

// Mercado Pago integration

// Endpoint to create Mercado Pago preference
app.post('/create-checkout-preference', fetchUser, async (req, res) => {
    const { items, address } = req.body;

    if (!address) {
        return res.status(400).json({ success: false, errors: "Address is required" });
    }

    let preference = {
        items: items.map(item => ({
            title: item.title + " - Size: " + item.size, // Add size to title
            unit_price: item.unit_price,
            quantity: item.quantity
        })),
        payer: {
            address: {
                street_name: address // Use the provided address
            }
        },
        back_urls: {
            success: 'https://rossoecom.netlify.app/success',
            failure: 'https://rossoecom.netlify.app/failure',
            pending: 'https://rossoecom.netlify.app/pending'
        },
        auto_return: 'approved',
        payment_methods: {
            excluded_payment_types: [
                { id: 'ticket' }
            ]
        },
        shipments: {
            cost: 30,
            mode: 'not_specified',
            receiver_address: {
                street_name: address // Use the provided address
            }
        }
    };

    try {
        const response = await payment.create({ body: preference });
        res.json({ id: response.body.id });
    } catch (error) {
        console.error('Error creating Mercado Pago preference:', error);
        res.status(500).send('Server Error');
    }
});

app.listen(port, (error) => {
    if (!error) {
        console.log("Server Running on Port " + port);
    } else {
        console.log("Error: " + error);
    }
});

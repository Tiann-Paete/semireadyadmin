import mysql from 'mysql2/promise';
import { parse } from 'url';
import { sign, verify } from 'jsonwebtoken';
import { query } from '../../utils/db';

const db = mysql.createPool({
  host: process.env.MYSQL_HOST,
  port: process.env.MYSQL_PORT,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

export default async function handler(req, res) {
  const { method } = req;
  const { pathname, query } = parse(req.url, true);

  console.log('Received request:', method, pathname, query);

  if (pathname === '/api/test') {
    res.status(200).json({ message: 'Test route working' });
    return;
  }

  if (pathname === '/api/admin-name') {
    try {
      const [results] = await db.query('SELECT full_name FROM admin LIMIT 1');
      if (results.length > 0) {
        res.status(200).json({ fullName: results[0].full_name });
      } else {
        res.status(404).json({ error: 'Admin not found' });
      }
    } catch (error) {
      console.error('Error fetching admin name:', error);
      res.status(500).json({ error: 'An error occurred while fetching admin name' });
    }
    return;
  }

  try {
    switch (method) {
      case 'GET':
        if (pathname === '/api/check-auth') {
          const authHeader = req.headers.authorization;
          if (!authHeader) {
            return res.status(200).json({ isAuthenticated: false, usernamePasswordVerified: false });
          }
        
          const token = authHeader.split(' ')[1];
          try {
            const decoded = verify(token, process.env.JWT_SECRET);
            const now = Math.floor(Date.now() / 1000);
            
            if (decoded.exp && decoded.exp > now) {
              return res.status(200).json({ 
                isAuthenticated: true, 
                usernamePasswordVerified: true,
                expiresIn: decoded.exp - now
              });
            } else {
              return res.status(200).json({ isAuthenticated: false, usernamePasswordVerified: false });
            }
          } catch (error) {
            return res.status(200).json({ isAuthenticated: false, usernamePasswordVerified: false });
          }
        } else if (pathname.match(/^\/api\/orders\/\d+\/products$/)) {
          // Extract orderId from pathname
          const orderId = pathname.split('/')[3];
          await handleGetOrderProducts(req, res, orderId);
        } else if (pathname === '/api/products') {
          await handleGetProducts(req, res);
        } else if (pathname === '/api/stocks') {
          await handleGetStocks(req, res);
        } else if (pathname === '/api/total-stock') {
          await handleGetTotalStock(req, res);
        } else if (pathname === '/api/sales-report') {
          await handleGetSalesReport(req, res);
        } else if (pathname === '/api/sales-data') {
          await handleGetSalesData(req, res);
        } else if (pathname === '/api/total-products') {
          await handleGetTotalProducts(req, res);
        } else if (pathname === '/api/top-products') {
          await handleGetTopProducts(req, res);
        } else if (pathname === '/api/rated-products-count') {
          await handleGetRatedProductsCount(req, res);
        } else if (pathname === '/api/logout') {
          await handleLogout(req, res);
          return;
        } else if (pathname === '/api/orders') {
          await handleGetOrders(req, res);
        } else  if (pathname === '/api/admin-data') {
          await handleGetAdminData(req, res);
        } else if (pathname === '/api/session-history') {
          await handleGetSessionHistory(req, res);
        } else  if (pathname === '/api/product-analytics') {
          await handleGetProductAnalytics(req, res);
        } else if (pathname === '/api/product-performance') {
          await handleGetProductPerformance(req, res);
        }  else if (pathname === '/api/daily-sales') {
          await handleGetDailySales(req, res);
        } else if (pathname === '/api/weekly-sales') {
          await handleGetWeeklySales(req, res);
        } else if (pathname === '/api/monthly-sales') {
          await handleGetMonthlySales(req, res);
        } else if (pathname === '/api/yearly-sales') {
          await handleGetYearlySales(req, res);
        } else if (pathname === '/api/order-details') {
          await handleGetOrderDetails(req, res);
        } else if (pathname === '/api/return-requests') {
          await handleGetReturnRequests(req, res);
        }
        break;

      case 'POST':
        if (pathname === '/api/signin') {
          await handleSignIn(req, res);
        } else if (pathname === '/api/validate-pin') {
          await handleValidatePin(req, res);
        } else  if (pathname === '/api/products') {
          await handleAddProduct(req, res);
        } else if (pathname === '/api/stocks') {
          await handleAddStock(req, res);
        }
        break;

        
      case 'PUT':
        if (pathname.startsWith('/api/products/')) {
          const id = pathname.split('/').pop();
          await handleUpdateProduct(req, res, id);
        } else if (pathname.startsWith('/api/stocks/')) {
          const id = pathname.split('/').pop();
          await handleUpdateStock(req, res, id);
        } else if (pathname.startsWith('/api/orders/')) {
    const parts = pathname.split('/');
    const id = parts[3]; 
    if (parts[4] === 'status') {
      await handleUpdateOrderStatus(req, res, id);
    } else if (parts[4] === 'cancel') {
      await handleCancelOrder(req, res, id);
    } else {
      await handleUpdateOrder(req, res, id);
    }
  }
  if (pathname === '/api/update-admin') {
    await handleUpdateAdminData(req, res);
  }
  break;
  case 'DELETE':
        if (pathname.startsWith('/api/products/')) {
          const id = pathname.split('/').pop();
          await handleDeleteProduct(req, res, id);
        } else if (pathname.startsWith('/api/stocks/')) {
          const id = pathname.split('/').pop();
          await handleDeleteStock(req, res, id);
        } else if (pathname.startsWith('/api/orders/') && pathname.endsWith('/salesreport')) {
          await handleRemoveOrderFromSalesReport(req, res);
        } else {
          res.status(404).json({ error: 'Route not found' });
        }
        break;

      default:
        res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
        res.status(405).end(`Method ${method} Not Allowed`);
    }

  res.status(404).json({ error: 'Route not found' });
  } catch (error) {
    console.error('Error in API route:', error);
    res.status(500).json({ error: 'An error occurred while processing your request' });
  }
}


//Sales Report 
async function handleGetOrderDetails(req, res) {
  const { date } = req.query;
  let dateCondition;
  
  if (!date) {
    dateCondition = 'DATE(o.order_date) = CURDATE()';
  } else {
    const queryDate = new Date(date);
    dateCondition = `DATE(o.order_date) = DATE('${queryDate.toISOString().split('T')[0]}')`;
  }

  try {
    const [results] = await db.query(`
      SELECT 
        o.order_date,
        o.full_name,
        op.name as product_name,
        op.quantity,
        op.price,
        p.image_url
      FROM orders o
      JOIN ordered_products op ON o.id = op.order_id
      JOIN products p ON op.product_id = p.id
      WHERE 
        ${dateCondition}
        AND o.status = 'Delivered'
        AND o.in_sales_report = 1
      ORDER BY o.order_date DESC
    `);

    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching order details:', error);
    res.status(500).json({ error: 'Error fetching order details' });
  }
}

async function handleGetMonthlySales(req, res) {
  const { year } = req.query;
  const currentYear = year || new Date().getFullYear();

  try {
    const [results] = await db.query(`
      SELECT 
        MONTH(order_date) as month,
        SUM(CASE WHEN status = 'Delivered' AND in_sales_report = 1 THEN 1 ELSE 0 END) as orderCount,
        CAST(COALESCE(SUM(CASE WHEN status = 'Delivered' AND in_sales_report = 1 THEN total ELSE 0 END), 0) AS DECIMAL(10,2)) as total
      FROM orders
      WHERE YEAR(order_date) = ?
      GROUP BY MONTH(order_date)
      ORDER BY month
    `, [currentYear]);

    const formattedResults = results.map(row => ({
      month: row.month,
      orderCount: Number(row.orderCount),
      total: Number(row.total)
    }));

    res.status(200).json(formattedResults);
  } catch (error) {
    console.error('Error fetching monthly sales:', error);
    res.status(500).json({ error: 'Error fetching monthly sales data' });
  }
}


async function handleGetDailySales(req, res) {
  try {
    const [results] = await db.query(`
      SELECT 
        DAYOFWEEK(order_date) as period,
        SUM(CASE WHEN status = 'Delivered' AND in_sales_report = 1 THEN 1 ELSE 0 END) as orders,
        CAST(COALESCE(SUM(CASE WHEN status = 'Delivered' AND in_sales_report = 1 THEN total ELSE 0 END), 0) AS DECIMAL(10,2)) as total
      FROM orders
      WHERE YEARWEEK(order_date) = YEARWEEK(CURDATE())
      GROUP BY DAYOFWEEK(order_date)
      ORDER BY period
    `);

    const daysOfWeek = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const fullWeekData = Array.from({ length: 7 }, (_, i) => ({
      period: daysOfWeek[i],
      orders: 0,
      total: 0
    }));

    results.forEach(row => {
      const dayIndex = row.period - 1;
      fullWeekData[dayIndex] = {
        period: daysOfWeek[dayIndex],
        orders: Number(row.orders),
        total: Number(row.total)
      };
    });

    res.status(200).json(fullWeekData);
  } catch (error) {
    console.error('Error fetching daily sales:', error);
    res.status(500).json({ error: 'Error fetching daily sales data' });
  }
}

async function handleGetWeeklySales(req, res) {
  try {
    const [results] = await db.query(`
      SELECT 
        WEEK(order_date) as weekNumber,
        MIN(DATE(order_date)) as weekStart,
        MAX(DATE(order_date)) as weekEnd,
        SUM(CASE WHEN status = 'Delivered' AND in_sales_report = 1 THEN 1 ELSE 0 END) as orders,
        CAST(COALESCE(SUM(CASE WHEN status = 'Delivered' AND in_sales_report = 1 THEN total ELSE 0 END), 0) AS DECIMAL(10,2)) as total,
        SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelledOrders,
        CAST(COALESCE(SUM(CASE WHEN status = 'Cancelled' THEN total ELSE 0 END), 0) AS DECIMAL(10,2)) as cancelledTotal
      FROM orders
      WHERE order_date >= DATE_SUB(CURDATE(), INTERVAL 7 WEEK)
      GROUP BY WEEK(order_date)
      ORDER BY weekNumber
    `);

    const formattedResults = results.map(row => ({
      period: `Week ${row.weekNumber} (${new Date(row.weekStart).toLocaleDateString()} - ${new Date(row.weekEnd).toLocaleDateString()})`,
      orders: Number(row.orders),
      total: Number(row.total),
      cancelledOrders: Number(row.cancelledOrders),
      cancelledTotal: Number(row.cancelledTotal)
    }));

    res.status(200).json(formattedResults);
  } catch (error) {
    console.error('Error fetching weekly sales:', error);
    res.status(500).json({ error: 'Error fetching weekly sales data' });
  }
}

async function handleGetYearlySales(req, res) {
  try {
    const currentYear = new Date().getFullYear();
    
    const [results] = await db.query(`
      SELECT 
        YEAR(order_date) as period,
        SUM(CASE WHEN status = 'Delivered' AND in_sales_report = 1 THEN 1 ELSE 0 END) as orders,
        CAST(COALESCE(SUM(CASE WHEN status = 'Delivered' AND in_sales_report = 1 THEN total ELSE 0 END), 0) AS DECIMAL(10,2)) as total,
        SUM(CASE WHEN status = 'Cancelled' THEN 1 ELSE 0 END) as cancelledOrders,
        CAST(COALESCE(SUM(CASE WHEN status = 'Cancelled' THEN total ELSE 0 END), 0) AS DECIMAL(10,2)) as cancelledTotal
      FROM orders
      WHERE YEAR(order_date) >= ?
      GROUP BY YEAR(order_date)
      ORDER BY period
    `, [currentYear - 4]);

    const yearlyData = Array.from({ length: 5 }, (_, index) => {
      const year = currentYear - 4 + index;
      return {
        period: year.toString(),
        orders: 0,
        total: 0,
        cancelledOrders: 0,
        cancelledTotal: 0
      };
    });

    results.forEach(row => {
      const yearIndex = row.period - (currentYear - 4);
      if (yearIndex >= 0 && yearIndex < 5) {
        yearlyData[yearIndex] = {
          period: row.period.toString(),
          orders: Number(row.orders),
          total: Number(row.total),
          cancelledOrders: Number(row.cancelledOrders),
          cancelledTotal: Number(row.cancelledTotal)
        };
      }
    });

    res.status(200).json(yearlyData);
  } catch (error) {
    console.error('Error fetching yearly sales:', error);
    res.status(500).json({ error: 'Error fetching yearly sales data' });
  }
}

async function handleGetSalesData(req, res) {
  const { date } = req.query;
  let dateCondition;
  
  if (!date) {
    dateCondition = 'DATE(order_date) = CURDATE()';
  } else {
    const queryDate = new Date(date);
    dateCondition = `DATE(order_date) = DATE('${queryDate.toISOString().split('T')[0]}')`;
  }

  try {
    const [salesResult] = await db.query(`
      SELECT COALESCE(SUM(total), 0) as periodSales
      FROM orders
      WHERE ${dateCondition} AND status = 'Delivered'
    `);

    const [ordersResult] = await db.query(`
      SELECT COUNT(*) as totalOrders
      FROM orders
      WHERE ${dateCondition}
    `);

    const [customersResult] = await db.query(`
      SELECT COUNT(DISTINCT user_id) as totalCustomers
      FROM orders
      WHERE ${dateCondition}
    `);

    const result = {
      periodSales: Number(salesResult[0].periodSales),
      totalOrders: ordersResult[0].totalOrders,
      totalCustomers: customersResult[0].totalCustomers
    };

    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching sales data:', error);
    res.status(500).json({ error: 'Error fetching sales data' });
  }
}

//Data Analytics for Products
async function handleGetTopProducts(req, res) {
  const [result] = await db.query(`
    SELECT 
      p.id,
      p.name,
      p.image_url,
      COALESCE(AVG(pr.rating), 0) as avg_rating,
      COALESCE(SUM(op.quantity), 0) as sold
    FROM products p
    LEFT JOIN ordered_products op ON p.id = op.product_id
    LEFT JOIN product_ratings pr ON p.id = pr.product_id
    GROUP BY p.id
    ORDER BY sold DESC, avg_rating DESC
    LIMIT 5
  `);
  
  const formattedResult = result.map(product => ({
    ...product,
    avg_rating: Number(product.avg_rating).toFixed(1)
  }));
  
  res.status(200).json(formattedResult);
}

async function handleGetRatedProductsCount(req, res) {
  const { timeFrame } = req.query;
  let dateCondition;

  switch (timeFrame) {
    case 'today':
      dateCondition = 'DATE(created_at) = CURDATE()';
      break;
    case 'yesterday':
      dateCondition = 'DATE(created_at) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)';
      break;
    case 'lastWeek':
      dateCondition = 'DATE(created_at) BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 WEEK) AND CURDATE()';
      break;
    case 'lastMonth':
      dateCondition = 'DATE(created_at) BETWEEN DATE_SUB(CURDATE(), INTERVAL 1 MONTH) AND CURDATE()';
      break;
    default:
      dateCondition = 'DATE(created_at) = CURDATE()';
  }

  const [result] = await db.query(`
    SELECT COUNT(DISTINCT product_id) as ratedProductsCount
    FROM product_ratings
    WHERE ${dateCondition}
  `);

  res.status(200).json(result[0]);
}


async function handleGetTotalProducts(req, res) {
  const [result] = await db.query('SELECT COUNT(*) as totalProducts FROM products');
  res.status(200).json(result[0]);
}


async function handleGetProductAnalytics(req, res) {
  try {
    const [products] = await db.query(`
     SELECT 
  p.*,
  COALESCE(ps.quantity, 0) as current_stock,
  COALESCE(AVG(pr.rating), 0) as avg_rating,
  COUNT(DISTINCT o.id) as order_count
FROM products p
LEFT JOIN product_stocks ps ON p.id = ps.product_id
LEFT JOIN product_ratings pr ON p.id = pr.product_id
LEFT JOIN ordered_products op ON p.id = op.product_id
LEFT JOIN orders o ON op.order_id = o.id
WHERE p.deleted = FALSE
GROUP BY p.id, ps.quantity
    `);

    const analyzedProducts = products.map(product => ({
      ...product,
      isSaleable: (
        product.order_count > 0 &&
        product.avg_rating >= 3.5 &&
        product.current_stock > 0
      )
    }));

    const saleableProducts = analyzedProducts.filter(p => p.isSaleable);
    const nonSaleableProducts = analyzedProducts.filter(p => !p.isSaleable);

    res.status(200).json({
      saleableProducts,
      nonSaleableProducts,
      totalProducts: products.length,
      saleableCount: saleableProducts.length,
      nonSaleableCount: nonSaleableProducts.length
    });
  } catch (error) {
    console.error('Error fetching product analytics:', error);
    res.status(500).json({ error: 'Error fetching product analytics' });
  }
}

async function handleGetProductPerformance(req, res) {
  try {
    const [performanceData] = await db.query(`
      SELECT 
        p.id,
        p.name,
        p.description,     
        p.price,
        p.image_url,
        p.category,        
        COUNT(DISTINCT o.id) as total_orders,
        COALESCE(SUM(op.quantity), 0) as total_units_sold,
        COALESCE(AVG(pr.rating), 0) as average_rating,
        COUNT(DISTINCT pr.id) as rating_count,
        ps.quantity as current_stock,
        ps.id as stock_id,
        MAX(pr.created_at) as latest_rating_date
      FROM products p
      LEFT JOIN ordered_products op ON p.id = op.product_id
      LEFT JOIN orders o ON op.order_id = o.id AND o.status != 'cancelled'
      LEFT JOIN product_ratings pr ON p.id = pr.product_id
      LEFT JOIN product_stocks ps ON p.id = ps.product_id
      WHERE p.deleted = FALSE
      GROUP BY p.id, ps.id, p.description, p.category 
      ORDER BY COALESCE(SUM(op.quantity), 0) DESC
    `);

    // More realistic thresholds for a smaller operation
    const saleableProducts = performanceData.filter(product => 
      product.total_units_sold >= 5  // Changed from 20 to 5
    );

    const nonSaleableProducts = performanceData.filter(product => 
      product.total_units_sold < 5 && product.total_units_sold > 0
    );

    // Get all rated products from the last 7 days instead of just today
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const ratedProducts = performanceData.filter(product => {
      if (!product.latest_rating_date) return false;
      const ratingDate = new Date(product.latest_rating_date);
      return ratingDate >= sevenDaysAgo;
    });

    res.status(200).json({
      performance: performanceData,
      saleableProducts: saleableProducts,
      nonSaleableProducts: nonSaleableProducts,
      ratedProducts: ratedProducts
    });
  } catch (error) {
    console.error('Error fetching product performance:', error);
    res.status(500).json({ error: 'Error fetching product performance' });
  }
}





//Login Authentication and Logout
async function handleSignIn(req, res) {
  const { username, password } = req.body;
  console.log('Signin attempt:', { username });

  try {
    const [results] = await db.query('SELECT * FROM admin WHERE username = ?', [username]);

    if (results.length === 0) {
      console.log('User not found');
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    const user = results[0];
    
    const passwordMatch = password === user.password;

    if (!passwordMatch) {
      console.log('Password mismatch');
      return res.status(401).json({ error: 'Invalid username or password' });
    }

    await db.query('INSERT INTO admin_sessions (admin_id, login_time) VALUES (?, NOW())', [user.id]);

    const token = sign({ userId: user.id }, process.env.JWT_SECRET, { expiresIn: '6h' });
    console.log('Login successful, token generated');
    
    res.status(200).json({ success: true, message: 'Signin successful', username: user.username, token: token });
  } catch (error) {
    console.error('Sign in error:', error);
    res.status(500).json({ error: 'An error occurred during signin' });
  }
}

async function handleValidatePin(req, res) {
  const { pin } = req.body;
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }

  try {
    const decoded = verify(token, process.env.JWT_SECRET);
    const [results] = await db.query('SELECT pin FROM admin WHERE id = ?', [decoded.userId]);
    
    if (results.length === 0) {
      return res.status(404).json({ error: 'Admin not found' });
    }

    const storedPin = results[0].pin;
    
    if (String(pin) === String(storedPin)) {
      res.status(200).json({ message: 'PIN validated successfully' });
    } else {
      res.status(401).json({ error: 'Invalid PIN' });
    }
  } catch (error) {
    console.error('Error validating PIN:', error);
    res.status(500).json({ error: 'An error occurred while validating PIN' });
  }
}

async function handleLogout(req, res) {
  const token = req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = verify(token, process.env.JWT_SECRET);
      await db.query(`
        UPDATE admin_sessions 
        SET logout_time = NOW() 
        WHERE admin_id = ? AND logout_time IS NULL 
        ORDER BY login_time DESC LIMIT 1
      `, [decoded.userId]);
    } catch (error) {
      console.error('Error during logout:', error);
    }
  }
  res.setHeader('Set-Cookie', 'token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly');
  res.status(200).json({ success: true, message: 'Logout successful' });
}

async function handleGetAdminData(req, res) {
  try {
    const [results] = await db.query('SELECT full_name, username, password, pin, role FROM admin LIMIT 1');
    if (results.length > 0) {
      const adminData = results[0];
      adminData.password = '*'.repeat(adminData.password.length);
      adminData.pin = '*'.repeat(adminData.pin.length);
      res.status(200).json(adminData);
    } else {
      res.status(404).json({ error: 'Admin not found' });
    }
  } catch (error) {
    console.error('Error fetching admin data:', error);
    res.status(500).json({ error: 'An error occurred while fetching admin data' });
  }
}

async function handleUpdateAdminData(req, res) {
  const { full_name, username, password, pin, role } = req.body;
  
  try {
    let sql = 'UPDATE admin SET full_name = ?, username = ?, role = ?';
    let params = [full_name, username, role];

    if (password) {
      sql += ', password = ?';
      params.push(password);
    }

    if (pin) {
      sql += ', pin = ?';
      params.push(pin);
    }

    sql += ' WHERE id = 1'; 

    const result = await query(sql, params);

    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Admin not found' });
    } else {
      res.status(200).json({ message: 'Admin data updated successfully' });
    }
  } catch (error) {
    console.error('Error updating admin data:', error);
    res.status(500).json({ error: 'An error occurred while updating admin data' });
  }
}

async function handleGetSessionHistory(req, res) {
  try {
    const [results] = await db.query(`
      SELECT 
        s.id, 
        a.full_name, 
        a.username, 
        s.login_time, 
        s.logout_time
      FROM 
        admin_sessions s
      JOIN 
        admin a ON s.admin_id = a.id
      ORDER BY 
        s.login_time DESC 
      LIMIT 50
    `);
    res.status(200).json(results);
  } catch (error) {
    console.error('Error fetching session history:', error);
    res.status(500).json({ error: 'An error occurred while fetching session history' });
  }
}


















// Products Add-Update-Delete in products table
async function handleGetProducts(req, res) {
  const { page = 1, limit = 10, id } = req.query;
  const offset = (page - 1) * limit;

  try {
    if (id) {
      const [product] = await db.query(
        `SELECT p.*,
         (SELECT COALESCE(ps.quantity, 0)) as current_stock,
         CalculateStockValue(p.id) as stock_value,
         NeedsRestock(p.id) as needs_restock
         FROM products p 
         LEFT JOIN product_stocks ps ON p.id = ps.product_id 
         WHERE p.id = ? AND p.deleted = FALSE
         LIMIT 1`,
        [parseInt(id)]
      );

      if (product.length === 0) {
        return res.status(404).json({ error: 'Product not found' });
      }

      return res.status(200).json({
        products: product,
        currentPage: 1,
        totalPages: 1,
        totalItems: 1
      });
    }

    // Modified paginated list query
    const [products] = await db.query(
      `SELECT p.*,
       (SELECT COALESCE(ps.quantity, 0)) as current_stock,
       CalculateStockValue(p.id) as stock_value,
       NeedsRestock(p.id) as needs_restock
       FROM products p 
       LEFT JOIN product_stocks ps ON p.id = ps.product_id 
       WHERE p.deleted = FALSE 
       LIMIT ? OFFSET ?`,
      [parseInt(limit), offset]
    );

    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM products WHERE deleted = FALSE'
    );
    
    res.status(200).json({
      products,
      currentPage: parseInt(page),
      totalPages: Math.ceil(countResult[0].total / limit),
      totalItems: countResult[0].total
    });
  } catch (error) {
    console.error('Error fetching products:', error);
    res.status(500).json({ error: 'Error fetching products' });
  }
}


async function handleGetTotalStock(req, res) {
  try {
    const [result] = await db.query(
      'SELECT SUM(quantity) as totalStock FROM product_stocks'
    );
    res.status(200).json({ totalStock: result[0].totalStock || 0 });
  } catch (error) {
    console.error('Error fetching total stock:', error);
    res.status(500).json({ error: 'Error fetching total stock' });
  }
}

async function handleAddProduct(req, res) {
  const { name, description, price, image_url, category, supplier_id } = req.body;
  const sql = "INSERT INTO products (name, description, price, image_url, category, supplier_id) VALUES (?, ?, ?, ?, ?, ?)";
  
  try {
    const [result] = await db.query(sql, [name, description, price, image_url, category, supplier_id]);
    
    res.status(201).json({ 
      message: 'Product added successfully', 
      id: result.insertId 
    });
  } catch (error) {
    console.error('Error adding product:', error);
    res.status(500).json({ error: 'Error adding product' });
  }
}

async function handleUpdateProduct(req, res, id) {
  const { name, description, price, image_url, category, supplier_id } = req.body;
  const sql = "UPDATE products SET name=?, description=?, price=?, image_url=?, category=?, supplier_id=? WHERE id=?";
  
  try {
    const [result] = await db.query(sql, [name, description, price, image_url, category, supplier_id, id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Product not found' });
    } else {
      res.status(200).json({ message: 'Product updated successfully' });
    }
  } catch (error) {
    console.error('Error updating product:', error);
    res.status(500).json({ error: 'Error updating product' });
  }
}

async function handleDeleteProduct(req, res, id) {
  const sql = "UPDATE products SET deleted = TRUE WHERE id = ?";
  
  try {
    const [result] = await db.query(sql, [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Product not found' });
    } else {
      // Also delete associated stock entries
      await db.query("DELETE FROM product_stocks WHERE product_id = ?", [id]);
      res.status(200).json({ message: 'Product marked as deleted successfully' });
    }
  } catch (error) {
    console.error('Error marking product as deleted:', error);
    res.status(500).json({ error: 'Error marking product as deleted' });
  }
}

// Stock Management Endpoints
async function handleGetStocks(req, res) {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  const offset = (page - 1) * limit;

  try {
    const [stocks] = await db.query(
      `SELECT 
        ps.id,
        ps.product_id,
        p.name,
        ps.quantity,
        ps.last_updated,
        CalculateStockValue(p.id) as stock_value,
        NeedsRestock(p.id) as needs_restock
      FROM product_stocks ps
      JOIN products p ON ps.product_id = p.id
      WHERE p.deleted = FALSE
      ORDER BY ps.last_updated DESC
      LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    const [countResult] = await db.query(
      'SELECT COUNT(*) as total FROM product_stocks ps JOIN products p ON ps.product_id = p.id WHERE p.deleted = FALSE'
    );

    res.status(200).json({
      stocks,
      totalPages: Math.ceil(countResult[0].total / limit),
      totalItems: countResult[0].total,
      currentPage: page
    });
  } catch (error) {
    console.error('Error fetching stocks:', error);
    res.status(500).json({ error: 'Error fetching stocks' });
  }
}

async function handleAddStock(req, res) {
  const { id, product_id, quantity } = req.body;
  
  try {
    // First, validate that the product exists and is not deleted
    const [productCheck] = await db.query(
      'SELECT * FROM products WHERE id = ? AND deleted = FALSE',
      [product_id]
    );

    if (productCheck.length === 0) {
      return res.status(404).json({ error: 'Product not found or has been deleted' });
    }

    // Check for existing stock entry
    const [existingStock] = await db.query(
      'SELECT * FROM product_stocks WHERE product_id = ?',
      [product_id]
    );

    // If stock exists for this product
    if (existingStock.length > 0) {
      // Update existing stock
      const newQuantity = existingStock[0].quantity + parseInt(quantity);
      const updateSql = `
        UPDATE product_stocks 
        SET quantity = ?,
            last_updated = NOW()
        WHERE product_id = ?
      `;
      
      await db.query(updateSql, [newQuantity, product_id]);

      return res.status(200).json({ 
        message: 'Stock updated successfully',
        stock: {
          id: existingStock[0].id,
          product_id,
          quantity: newQuantity,
          last_updated: new Date()
        }
      });
    }

    // If no existing stock, create new entry
    const insertSql = `
      INSERT INTO product_stocks 
      (id, product_id, quantity, last_updated) 
      VALUES (?, ?, ?, NOW())
    `;
    
    const [result] = await db.query(insertSql, [id, product_id, quantity]);

    res.status(201).json({ 
      message: 'Stock added successfully', 
      stock: {
        id,
        product_id,
        quantity,
        last_updated: new Date()
      }
    });
  } catch (error) {
    console.error('Error managing stock:', error);
    res.status(500).json({ error: 'Error managing stock' });
  }
}

async function handleUpdateStock(req, res, id) {
  const { quantity, operation = 'set' } = req.body;
  
  try {
    // First, get the current stock
    const [existingStock] = await db.query(
      'SELECT * FROM product_stocks WHERE id = ?',
      [id]
    );

    if (existingStock.length === 0) {
      return res.status(404).json({ error: 'Stock entry not found' });
    }

    let newQuantity;
    switch (operation) {
      case 'add':
        newQuantity = existingStock[0].quantity + parseInt(quantity);
        break;
      case 'subtract':
        newQuantity = existingStock[0].quantity - parseInt(quantity);
        break;
      default: // 'set'
        newQuantity = parseInt(quantity);
    }

    // Ensure quantity doesn't go below 0
    newQuantity = Math.max(0, newQuantity);

    // Update the stock quantity
    const sql = `
      UPDATE product_stocks 
      SET quantity = ?,
          last_updated = NOW()
      WHERE id = ?
    `;
    
    await db.query(sql, [newQuantity, id]);

    res.status(200).json({ 
      message: 'Stock updated successfully',
      stock: {
        id,
        quantity: newQuantity,
        last_updated: new Date()
      }
    });
  } catch (error) {
    console.error('Error updating stock:', error);
    res.status(500).json({ error: 'Error updating stock' });
  }
}

async function handleDeleteStock(req, res, id) {
  try {
    const [stock] = await db.query('SELECT * FROM product_stocks WHERE id = ?', [id]);
    
    if (stock.length === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    // Delete the stock record
    await db.query('DELETE FROM product_stocks WHERE id = ?', [id]);

    res.status(200).json({ message: 'Stock deleted successfully' });
  } catch (error) {
    console.error('Error deleting stock:', error);
    res.status(500).json({ error: 'Error deleting stock' });
  }
}












//Order Monitoring
async function handleGetSalesReport(req, res) {
  try {
    const [result] = await db.query(`
      SELECT 
        o.*,
        GROUP_CONCAT(CONCAT(op.name, ' (', op.quantity, ')') SEPARATOR ', ') AS ordered_products
      FROM orders o
      LEFT JOIN ordered_products op ON o.id = op.order_id
      WHERE o.in_sales_report = 1
      GROUP BY o.id
      ORDER BY o.order_date DESC
    `);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching sales report:', error);
    res.status(500).json({ error: 'An error occurred while fetching sales report data' });
  }
}

async function handleUpdateOrderStatus(req, res, id) {
  const { status } = req.body;
  console.log('Updating order status:', id, status);

  const sql = "UPDATE orders SET status = ? WHERE id = ?";
  try {
    const [result] = await db.query(sql, [status, id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Order not found' });
    } else {
      res.status(200).json({ message: 'Order status updated successfully', status: status });
    }
  } catch (error) {
    console.error('Error updating order status:', error);
    res.status(500).json({ error: 'Error updating order status' });
  }
}

async function handleCancelOrder(req, res, id) {
  const sql = "UPDATE orders SET status = 'Cancelled' WHERE id = ?";
  try {
    const [result] = await db.query(sql, [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Order not found' });
    } else {
      res.status(200).json({ message: 'Order cancelled successfully' });
    }
  } catch (error) {
    console.error('Error cancelling order:', error);
    res.status(500).json({ error: 'Error cancelling order' });
  }
}
async function handleUpdateOrder(req, res, id) {
  const { order_date } = req.body;
  const sql = "UPDATE orders SET order_date = ? WHERE id = ?";
  try {
    const [result] = await db.query(sql, [order_date, id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Order not found' });
    } else {
      res.status(200).json({ message: 'Order date updated successfully' });
    }
  } catch (error) {
    console.error('Error updating order date:', error);
    res.status(500).json({ error: 'Error updating order date' });
  }
}
async function handleRemoveOrderFromSalesReport(req, res) {
  const { id } = req.query;
  const sql = "UPDATE orders SET in_sales_report = 0 WHERE id = ?";
  try {
    const [result] = await db.query(sql, [id]);
    if (result.affectedRows === 0) {
      res.status(404).json({ error: 'Order not found' });
    } else {
      res.status(200).json({ message: 'Order removed from sales report successfully' });
    }
  } catch (error) {
    console.error('Error removing order from sales report:', error);
    res.status(500).json({ error: 'Error removing order from sales report' });
  }
}

async function handleGetOrders(req, res) {
  try {
    const [result] = await db.query(`
      SELECT o.*, 
             GROUP_CONCAT(
               CONCAT(
                 op.name, 
                 ' (', op.quantity, ')',
                 ' [', IFNULL(p.image_url, ''), ']'
               ) 
               SEPARATOR ', '
             ) AS ordered_products
      FROM orders o
      LEFT JOIN ordered_products op ON o.id = op.order_id
      LEFT JOIN products p ON op.product_id = p.id
      WHERE o.in_sales_report = 1
      GROUP BY o.id
    `);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching orders:', error);
    res.status(500).json({ error: 'An error occurred while fetching orders' });
  }
}

async function handleGetOrderProducts(req, res, orderId) {
  try {
    const [products] = await db.query(`
      SELECT 
        p.id,
        p.name,
        p.image_url,
        op.quantity,
        op.price
      FROM ordered_products op
      JOIN products p ON op.product_id = p.id
      WHERE op.order_id = ?
    `, [orderId]);

    res.status(200).json(products);
  } catch (error) {
    console.error('Error fetching order products:', error);
    res.status(500).json({ error: 'An error occurred while fetching order products' });
  }
}

async function handleGetReturnRequests(req, res) {
  try {
    const [result] = await db.query(`
      SELECT 
  o.id,
  o.user_id,
  o.full_name,
  o.phone_number,
  o.address,
  o.city,
  o.state_province,
  o.postal_code,
  o.delivery_address,
  o.payment_method,
  o.subtotal,
  o.delivery_fee,
  o.total,
  o.order_date,
  o.tracking_number,
  o.status,
  o.in_sales_report,
  o.is_rated,
  MAX(feedback.feedback) as feedback,
  MAX(feedback.created_at) as created_at,
  (
    SELECT GROUP_CONCAT(DISTINCT CONCAT('• ', op2.name, ' (', op2.quantity, ')') SEPARATOR '\n')
    FROM ordered_products op2
    WHERE op2.order_id = o.id
  ) AS ordered_products
FROM orders o
LEFT JOIN order_feedback feedback ON o.id = feedback.order_id
WHERE o.status IN ('Returned', 'Refunded', 'Return Cancelled')
GROUP BY 
  o.id,
  o.user_id,
  o.full_name,
  o.phone_number,
  o.address,
  o.city,
  o.state_province,
  o.postal_code,
  o.delivery_address,
  o.payment_method,
  o.subtotal,
  o.delivery_fee,
  o.total,
  o.order_date,
  o.tracking_number,
  o.status,
  o.in_sales_report,
  o.is_rated
ORDER BY 
  CASE 
    WHEN o.status = 'Returned' THEN 0
    ELSE 1
  END,
  MAX(feedback.created_at) DESC
    `);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error fetching return requests:', error);
    res.status(500).json({ error: 'An error occurred while fetching return requests' });
  }
}

export { handleUpdateAdminData };
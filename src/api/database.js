// Database connection for Hostinger MySQL
const mysql = require('mysql2/promise');

const dbConfig = {
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: process.env.DB_PORT || 3306,
  connectTimeout: 60000,
  acquireTimeout: 60000,
  timeout: 60000
};

// Insert specialist data
async function insertSpecialist(data) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    
    const query = `
      INSERT INTO specialists (
        name, email, phone, country, title, experience, specialization,
        bio, services, certifications, portfolio, linkedin, availability, rate
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      data.name, data.email, data.phone, data.country, data.title,
      data.experience, data.specialization, data.bio, data.services,
      data.certifications, data.portfolio, data.linkedin, data.availability, data.rate
    ];
    
    const [result] = await connection.execute(query, values);
    return result;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

// Insert business data
async function insertBusiness(data) {
  let connection;
  try {
    connection = await mysql.createConnection(dbConfig);
    
    const query = `
      INSERT INTO businesses (
        name, email, phone, position, company, industry, size, description,
        website, needs, expertise, project_details, budget, timeline
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;
    
    const values = [
      data.name, data.email, data.phone, data.position, data.company,
      data.industry, data.size, data.description, data.website, data.needs,
      data.expertise, data.projectDetails, data.budget, data.timeline
    ];
    
    const [result] = await connection.execute(query, values);
    return result;
  } catch (error) {
    console.error('Database error:', error);
    throw error;
  } finally {
    if (connection) await connection.end();
  }
}

module.exports = { insertSpecialist, insertBusiness };
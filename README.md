
# ZEDX Backend

![Tech](https://img.shields.io/badge/Node.js-Backend-green)
![Status](https://img.shields.io/badge/status-MVP-blue)



## Project Overview

This repository contains the Node.js backend for the ZEDX application.

The backend provides RESTful APIs for authentication and core business logic. It is designed to be secure, lightweight, and scalable for MVP development. The backend is designed in a such to 
handle JWT-based authentication, Database connectivity, REST API handling. The application is integrated with 3rd party API services to get the details from Plaid and Dwolla.

To Start this application you need to set-up your own third party application keys.


## Key Features

- User registration and login
- JWT-based authentication
- Centralized route handling
- Environment-based configuration
- Health check endpoint


## Tech Stack

- ![NodeJS](https://img.shields.io/badge/node.js-6DA55F?style=for-the-badge&logo=node.js&logoColor=white)
- ![Express.js](https://img.shields.io/badge/express.js-%23404d59.svg?style=for-the-badge&logo=express&logoColor=%2361DAFB)
- ![JWT](https://img.shields.io/badge/JWT-black?style=for-the-badge&logo=JSON%20web%20tokens)
- ![Postgres](https://img.shields.io/badge/postgres-%23316192.svg?style=for-the-badge&logo=postgresql&logoColor=white)
- RESTful API architecture


## Architecture

- Handles authentication and business logic
- Issues and validates JWT tokens
- Communicates with frontend via REST APIs
- Designed for scalability and clean separation of concerns


## Installation

Prerequisites:
- Node.js (v18+)
- npm
- DB
- Plaid
- Dwolla

Setup:

1. Clone the repository:
   ```bash
   git clone https://github.com/Venkat-Siva-Prasad-Reddy-Eppagunta/ZEDX-Backend.git
2. Navigate to the project directory:
   ```bash
   cd zedx-backend
3. Install dependencies using Composer:
   ```bash
   npm install
4. Create a .env file:
   ```sh
   PORT = 5001
   DB_URL = your_own_DB_URL
   EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY = Your_Own_KEY
   PLAID_CLIENT_ID = Your_Own_KEY
   PLAID_SECRET = Your_Own_KEY
   JWT_SECRET = Your_Own_KEY
   DWOLLA_ENV = sandbox          # sandbox | production
   DWOLLA_KEY = Your_Own_KEY
   DWOLLA_SECRET = Your_Own_KEY
   DWOLLA_BASE_URL = your_OWN_URL
   SSN_ENCRYPTION_KEY = Your_Own_KEY
5. Running the App
   ```sh
   npm run dev

## Running the Server

Server runs at:

```sh
http://localhost:5001
```


## Support Us

If you find this project useful, please give it a star! ⭐

[![Star Badge](https://img.shields.io/github/stars/Venkat-Siva-Prasad-Reddy-Eppagunta/zedx?style=social)](https://github.com/Venkat-Siva-Prasad-Reddy-Eppagunta/zedx)

Your support helps us improve and maintain this project!


## Contact

- **Venkat Siva Prasad Reddy Eppagunta**
- GitHub: [![GitHub](https://img.shields.io/badge/GitHub-Venkat_Siva_Prasa_Reddy_Eppagunta-black?style=flat&logo=github&logoColor=white)](https://github.com/Venkat-Siva-Prasad-Reddy-Eppagunta)
- LinkedIn: [![LinkedIn](https://img.shields.io/badge/LinkedIn-Venka_Siva_Prasa_Reddy_Eppagunta-blue?style=flat&logo=linkedin&logoColor=white)](https://www.linkedin.com/in/venkata-eppagunta/)





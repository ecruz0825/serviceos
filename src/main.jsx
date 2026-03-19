import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import App from './App'
import './index.css'
import { UserProvider } from "./context/UserContext";
import { BrandProvider } from "./context/BrandContext";
import { initSentry } from "./sentry.client";

// Initialize Sentry once at app startup (role will be updated per route)
initSentry({ role: "app" });


ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <UserProvider>
        <BrandProvider>
          <App />
          <Toaster position="top-center" />
        </BrandProvider>
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>
)
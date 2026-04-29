// frontend/src/main.jsx
import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { Toaster } from "react-hot-toast";

import App from "./App.jsx";
import AppErrorBoundary from "./components/errors/AppErrorBoundary.jsx";
import { AuthProvider } from "./context/AuthContext.jsx";
import { LocationProvider } from "./context/LocationContext.jsx";

import "leaflet/dist/leaflet.css";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppErrorBoundary>
        <AuthProvider>
          <LocationProvider>
            <App />
            <Toaster
              position="top-right"
              toastOptions={{
                duration: 3500
              }}
            />
          </LocationProvider>
        </AuthProvider>
      </AppErrorBoundary>
    </BrowserRouter>
  </React.StrictMode>
);
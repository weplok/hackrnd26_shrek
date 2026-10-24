<<<<<<< HEAD
import React from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.tsx";
import "./ui.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
=======
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './app/App';
import './styles/global.css';

const root = document.querySelector('#root');

if (!root) {
  throw new Error('Root element is missing.');
}

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
>>>>>>> 6f0b5d1021ece56acf7816db674f9ce1fececf1a
);

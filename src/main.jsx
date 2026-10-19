import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { createAppUpdater } from './app-updates.js'
import '@fontsource/cormorant-garamond/latin-400.css'
import '@fontsource/cormorant-garamond/latin-400-italic.css'
import '@fontsource/cormorant-garamond/latin-500.css'
import '@fontsource/cormorant-garamond/latin-600.css'
import '@fontsource/cormorant-garamond/latin-700.css'
import '@fontsource/inter/latin-400.css'
import '@fontsource/inter/latin-500.css'
import '@fontsource/inter/latin-600.css'
import '@fontsource/inter/latin-700.css'
import './index.css'

async function startApp() {
  const updater = import.meta.env.PROD ? createAppUpdater({ version:__SNB_BUILD_VERSION__ }) : null;
  if (await updater?.check({ startup:true })) return;
  updater?.start();
  ReactDOM.createRoot(document.getElementById('root')).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}

startApp()

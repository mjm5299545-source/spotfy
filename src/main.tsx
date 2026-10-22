import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AppProvider} from './state';
import {PlayerProvider} from './player/PlayerProvider';
import App from './App';
import './styles.css';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter><AppProvider><PlayerProvider><App/></PlayerProvider></AppProvider></BrowserRouter></React.StrictMode>);

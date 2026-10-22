import { createApp } from './app.ts';
const port=Number(process.env.PORT || 3001);
const instance=createApp({dataDir:process.env.DATA_DIR});
const server=instance.app.listen(port,process.env.HOST || '127.0.0.1',()=>console.log(`Spotfy API iniciada na porta ${port}.`));
function shutdown(){server.close(()=>{instance.close();process.exit(0);});setTimeout(()=>process.exit(1),5000).unref();}
process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);

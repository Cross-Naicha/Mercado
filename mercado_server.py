"""Servidor con recarga limitada a los módulos Python de Mercado."""
import argparse
from pathlib import Path
import uvicorn
from uvicorn.supervisors.statreload import StatReload

ROOT = Path(__file__).resolve().parent

class MercadoReload(StatReload):
    def iter_py_files(self):
        # Los módulos de la aplicación están en la raíz. No recorrer .git ni datos.
        yield from ROOT.glob("*.py")

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args()
    config = uvicorn.Config("test:app", host="127.0.0.1", port=args.port,
                            reload=True, reload_dirs=[str(ROOT)])
    server = uvicorn.Server(config)
    sock = config.bind_socket()
    MercadoReload(config, target=server.run, sockets=[sock]).run()

if __name__ == "__main__":
    main()

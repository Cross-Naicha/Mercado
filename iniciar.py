"""Inicio con doble clic: servidor local y acceso privado por Tailscale."""
import argparse
import json
import os
import re
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
import webbrowser

ROOT=Path(__file__).resolve().parent
PORT=8000
LOCAL=f'http://127.0.0.1:{PORT}'

def request_json(url):
    with urllib.request.urlopen(url,timeout=2) as response:
        return json.load(response)

def is_mercado():
    try:
        spec=request_json(LOCAL+'/openapi.json')
        return all(path in spec.get('paths',{}) for path in ['/api/catalog','/api/stock','/api/sync'])
    except Exception:
        return False

def tailscale_phone_url(configure=True):
    executable=shutil.which('tailscale')
    if not executable:
        candidate=Path(os.environ.get('ProgramFiles',r'C:\Program Files'))/'Tailscale'/'tailscale.exe'
        executable=str(candidate) if candidate.exists() else None
    if not executable:
        print('Tailscale no esta instalado: podes usar Mercado en esta PC.');return None
    def run(*args):
        try:
            result=subprocess.run([executable,*args],capture_output=True,text=True,timeout=15)
        except subprocess.TimeoutExpired as error:
            output=error.stdout or b''
            if isinstance(output,bytes): output=output.decode('utf-8',errors='replace')
            link=re.search(r'https://login\.tailscale\.com/[^\s]+',output)
            if link:
                raise RuntimeError('Tailscale pide habilitar Serve una sola vez. Abri '+link.group(0)+' y luego volve a iniciar Mercado.') from error
            raise
        if result.returncode: raise RuntimeError(result.stderr.strip() or result.stdout.strip())
        return result.stdout
    try:
        status=json.loads(run('status','--json'))
        if status.get('BackendState')!='Running':
            print('Conecta Tailscale en esta PC para habilitar el telefono.');return None
        dns=status.get('Self',{}).get('DNSName','').rstrip('.')
        if not dns: return None
        config=json.loads(run('serve','status','--json') or '{}')
        address=dns+':8443'
        handlers=config.get('Web',{}).get(address,{}).get('Handlers',{})
        target=handlers.get('/',{}).get('Proxy','').rstrip('/')
        occupied=address in config.get('Web',{}) or '8443' in config.get('TCP',{})
        if occupied and (target!=LOCAL or any(path!='/' for path in handlers)):
            print('Tailscale ya usa el puerto 8443 para otra configuracion. No se modifico.');return None
        if not occupied:
            if not configure:
                print('Tailscale disponible; el acceso se configurara al iniciar.');return None
            with socket.socket() as probe:
                if probe.connect_ex(('127.0.0.1',8443))==0:
                    print('El puerto 8443 esta ocupado. No se modifico el acceso de otras aplicaciones.');return None
            print('Preparando el acceso privado para el telefono...')
            run('serve','--bg','--https=8443',LOCAL)
        return 'https://'+address+'/home'
    except (ValueError,RuntimeError,subprocess.TimeoutExpired,OSError) as error:
        print('No se pudo preparar Tailscale:',error)
        print('Mercado sigue disponible en la PC.');return None

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('--check',action='store_true',help='Diagnostico sin iniciar ni configurar servicios')
    parser.add_argument('--no-browser',action='store_true')
    args=parser.parse_args()
    os.chdir(ROOT)
    if args.check:
        import uvicorn
        print('Python y servidor disponibles.')
        print('Servidor Mercado activo:',is_mercado())
        phone=tailscale_phone_url(configure=False)
        if phone: print('Telefono:',phone)
        return
    process=None
    try:
        if is_mercado():
            print('Mercado ya esta abierto; se reutiliza el servidor existente.')
            print('Si acabas de actualizarlo, cerra la ventana anterior y volve a iniciar.')
        else:
            import uvicorn
            print('Iniciando Mercado...')
            process=subprocess.Popen([sys.executable,'-m','uvicorn','test:app','--host','127.0.0.1','--port',str(PORT),'--reload','--reload-dir',str(ROOT)],cwd=ROOT)
            for _ in range(40):
                if process.poll() is not None: raise RuntimeError('El servidor no pudo iniciar. Revisa el mensaje anterior.')
                if is_mercado(): break
                time.sleep(.25)
            else: raise RuntimeError('El servidor no respondio a tiempo.')
        phone=tailscale_phone_url()
        print('\nPC: '+LOCAL+'/home')
        if phone:
            print('TELEFONO: '+phone)
            print('Activa Tailscale en el telefono y abri esa direccion.')
        print('\nDeja esta ventana abierta. Para detener Mercado, presiona Ctrl+C.\n')
        if not args.no_browser: webbrowser.open(LOCAL+'/home')
        if process: process.wait()
        else:
            try: input('Presiona Enter para cerrar esta ventana (el servidor existente seguira abierto).')
            except EOFError: pass
    except KeyboardInterrupt:
        print('\nCerrando Mercado...')
    finally:
        if process and process.poll() is None:
            process.terminate()
            try: process.wait(timeout=5)
            except subprocess.TimeoutExpired: process.kill();process.wait()

if __name__=='__main__':
    try: main()
    except Exception as error:
        print('Error:',error);sys.exit(1)

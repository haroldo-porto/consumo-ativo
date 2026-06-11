import requests
import json

def test_api():
    url = "http://127.0.0.1:5000/api/read"
    # O arquivo medidor2.jpeg está no diretório pai
    image_path = "../medidor2.jpeg"
    
    print(f"Enviando requisição para {url} com o arquivo {image_path}...")
    try:
        with open(image_path, "rb") as f:
            files = {"image": f}
            response = requests.post(url, files=files)
            
        print(f"Status Code: {response.status_code}")
        if response.status_code == 200:
            data = response.json()
            print("Sucesso!")
            print(f"Leitura: {data.get('reading')}")
            print(f"Dígitos: {data.get('digits')}")
            print(f"Image URL (Base64) recebida: {data.get('image_url')[:100]}...")
        else:
            print("Erro do servidor:")
            print(response.text)
    except Exception as e:
        print(f"Erro ao conectar na API: {str(e)}")

if __name__ == "__main__":
    test_api()

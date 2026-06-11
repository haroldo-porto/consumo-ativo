# Guia de Implantação e Execução: Consumo Ativo

Este documento orienta sobre como executar o aplicativo localmente, acessá-lo pelo celular e implantá-lo gratuitamente em servidores de nuvem como o **Render**.

---

## 1. Executando Localmente

Para rodar a aplicação no seu computador:

1. Certifique-se de que as dependências estão instaladas. No terminal, na pasta do projeto (`C:\Users\haroldo.porto\.gemini\antigravity\scratch\gestao-energia`), execute:
   ```bash
   pip install -r requirements.txt
   ```
2. Inicie o servidor Flask:
   ```bash
   python app.py
   ```
3. Abra o navegador e acesse: `http://127.0.0.1:5000`

### Como acessar do celular (mesmo Wi-Fi):
1. No seu computador, descubra o seu IP local. 
   - No Windows, abra o prompt de comando (cmd) e digite `ipconfig`.
   - Procure pelo campo `IPv4 Address` correspondente à sua rede sem fio (ex: `192.168.1.50`).
2. No seu celular conectado no mesmo Wi-Fi, abra o navegador e digite o IP seguido da porta `:5000` (ex: `http://192.168.1.50:5000`).
3. O aplicativo se abrirá responsivo e você poderá usar a câmera do celular para tirar fotos do medidor!

---

## 2. Publicando Gratuitamente no Render (Cloud)

O Render permite colocar seu projeto online sem custos. Siga este passo a passo:

### Passo 1: Preparar o Código no GitHub
1. Crie uma conta no [GitHub](https://github.com/) (se não tiver).
2. Crie um repositório privado ou público chamado `consumo-ativo`.
3. Suba a pasta do projeto `gestao-energia` (com todos os arquivos gerados) para este repositório do GitHub.
   - *Importante:* Não suba imagens pesadas como `medidor.jpg.jpeg` ou `medidor2.jpeg` se quiser manter o repositório limpo, mas suba todos os outros arquivos (`app.py`, `requirements.txt`, `templates/`, `static/`).

### Passo 2: Criar Conta no Render
1. Acesse o [Render](https://render.com/) e crie uma conta gratuita. Você pode fazer login diretamente usando sua conta do GitHub (altamente recomendado!).

### Passo 3: Criar um Novo Web Service
1. No painel do Render, clique no botão **New +** no canto superior direito e selecione **Web Service**.
2. Conecte sua conta do GitHub (caso ainda não tenha conectado).
3. Selecione o repositório `consumo-ativo` que você acabou de criar.

### Passo 4: Configurar o Web Service
Preencha os campos de configuração da seguinte forma:
- **Name:** `consumo-ativo` (ou outro nome de sua escolha)
- **Region:** Escolha a mais próxima de você (ex: `Ohio` ou `Oregon`)
- **Branch:** `main` (ou a branch padrão do seu repositório)
- **Root Directory:** Deixe em branco (se os arquivos estiverem na raiz do repositório) ou defina o caminho correspondente.
- **Runtime:** `Python`
- **Build Command:**
  ```bash
  pip install -r requirements.txt
  ```
- **Start Command:**
  ```bash
  gunicorn app:app
  ```
- **Instance Type:** `Free` (Grátis)

### Passo 5: Publicar (Deploy)
1. Clique em **Create Web Service** no final da página.
2. O Render começará a compilar e instalar as dependências automaticamente. Esse processo pode levar cerca de 2 a 4 minutos na primeira vez.
3. Assim que o log exibir "Your service is live", você verá um link no canto superior esquerdo (ex: `https://consumo-ativo.onrender.com`).
4. **Pronto!** Acesse esse link de qualquer celular ou computador conectado à internet. O aplicativo estará 100% operacional e seus dados (histórico e configurações) serão preservados no seu navegador sem custo de banco de dados.

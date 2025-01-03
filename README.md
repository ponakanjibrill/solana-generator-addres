# solana-generator-addres

This script allows you to generate Solana addresses

## Prerequisites

Before using this script, make sure you have the following installed:
- `bash`
- `curl`

## Install

   ```bash
   sudo apt update
   sudo apt install python3 python3-pip
   ```

   ```bash
   pip3 install tqdm termcolor
   ```

Install Solana CLI

    curl -sSf https://release.anza.xyz/stable/install | sh


NEXT

If using Codespace

    export PATH="/home/codespace/.local/share/solana/install/active_release/bin:$PATH"

If using Ubuntu/VPS

    export PATH="/home/ubuntu/.local/share/solana/install/active_release/bin:$PATH"

must be compatible with your OS or Device



If already export check this
    
    solana --version



## USAGE

1. Clone this repository:

   ```bash
   git clone https://github.com/ponakanjibrill/solana-generator-addres.git
   ```

2. Go

   ```bash
   cd solana-generator-addres
   ```

   ```
   pip install -r requirements.txt
   ```

3. Run Script

   ```bash
   python3 generate_wallet.py
   ```


   Example: (Max 30)

   ```bash
   Berapa banyak wallet yang ingin di-generate? 5
   ```

Check Hasil generator

   ```
   cd hasil_wallet
   ```

   ```
   nano wallet.txt
   ```

For Bot TX (Support MultiAccount)



    npm install @solana/web3.js @solana/spl-token bs58@4.0.1 dotenv readline-sync


open file
    
    cd solana-generator-addres


   - impor privatkey and recipient address in file ```data.env```

   Example `data.env`:
   

   ```
PRIVATE_KEYS=base58key1,base58key2,base58key3
RECIPIENT_ADDRESS=your recipient address
```

    
    node sender.js

    



Done Cok

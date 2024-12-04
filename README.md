# solana-generator-addres

This script allows you to generate Solana addresses

## Prerequisites

Before using this script, make sure you have the following installed:
- `bash`
- `curl

## Install

   ```bash
   sudo apt update
   sudo apt install python3 python3-pip
   ```

   ```bash
   pip3 install tqdm termcolor
   ```

Install Solana CLI

    sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"

OR

    curl -sSf https://release.anza.xyz/stable/install | sh

check if Installed

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
   python3 generate_wallets.py
   ```


   Example:

   ```bash
   Berapa banyak wallet yang ingin di-generate? 5
   Apakah ingin menggunakan pasphrasse untuk mnemonic y/n?
   ```

   Done Cok

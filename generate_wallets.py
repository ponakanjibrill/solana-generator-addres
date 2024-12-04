import subprocess
import json
import os
import time
from tqdm import tqdm
from termcolor import colored

def generate_wallet(passphrase=None):
    """
    Fungsi untuk menghasilkan wallet Solana, mengambil public key, private key,
    dan mnemonic jika passphrase digunakan.
    """
    try:
        # Menjalankan perintah untuk menghasilkan keypair baru, dengan passphrase jika diberikan
        command = ["solana-keygen", "new", "--no-bip39-passphrase" if passphrase is None else "--bip39-passphrase", "--outfile", "/tmp/temp_keypair.json"]
        subprocess.run(command, check=True)

        # Mengambil public key dari file keypair
        public_key = subprocess.check_output(["solana-keygen", "pubkey", "/tmp/temp_keypair.json"]).decode('utf-8').strip()

        # Membaca file keypair untuk mendapatkan private key
        with open("/tmp/temp_keypair.json", "r") as f:
            keypair_data = json.load(f)

        # Private key ada dalam keypair_data, dalam format array byte
        private_key = keypair_data  # Seluruh array mewakili secretKey

        # Mengonversi private key ke format hexadecimal
        private_key_hex = ''.join([format(i, '02x') for i in private_key])

        # Mendapatkan mnemonic jika passphrase digunakan
        if passphrase:
            mnemonic = subprocess.check_output(["solana-keygen", "dump", "/tmp/temp_keypair.json"]).decode('utf-8').strip()
        else:
            mnemonic = "Mnemonic tidak tersedia tanpa passphrase."

        return public_key, private_key_hex, mnemonic

    except subprocess.CalledProcessError as e:
        print(f"Error saat menjalankan solana-keygen: {e}")
        return None, None, None
    except Exception as e:
        print(f"Terjadi kesalahan: {e}")
        return None, None, None
    finally:
        # Membersihkan file sementara keypair yang dibuat
        if os.path.exists("/tmp/temp_keypair.json"):
            os.remove("/tmp/temp_keypair.json")

def loading_message(message):
    """
    Fungsi untuk menampilkan pesan loading dengan nama "Ponakan Jibril"
    """
    print(colored("Loading, Ponakan Jibril sedang bekerja keras...", "yellow"))
    for _ in tqdm(range(100), desc=message, ncols=100, ascii=True):
        time.sleep(0.02)

def main():
    print(colored("==============================================", "green"))
    print(colored("    Solana Wallet Generator - Ponakan Jibril    ", "cyan"))
    print(colored("==============================================", "green"))
    print("\n")

    # Menunggu pengguna untuk input jumlah wallet
    num_wallets = int(input("Berapa banyak wallet yang ingin di-generate? "))
    use_passphrase = input("Apakah Anda ingin menggunakan passphrase untuk mnemonic (y/n)? ").lower() == 'y'
    
    passphrase = None
    if use_passphrase:
        passphrase = input("Masukkan passphrase untuk mnemonic: ")
    
    # Loading animation
    loading_message("Menghasilkan wallet Solana...")

    with open("wallet.txt", "w") as wallet_file:
        for _ in range(num_wallets):
            public_key, private_key, mnemonic = generate_wallet(passphrase)
            if public_key and private_key:
                wallet_file.write(f"Public Key: {public_key}\n")
                wallet_file.write(f"Private Key (Hex): {private_key}\n")
                wallet_file.write(f"Mnemonic: {mnemonic}\n")
                wallet_file.write("=" * 80 + "\n")
                print(f"{colored('Wallet', 'green')} {public_key} {colored('berhasil dibuat.', 'green')}")
            else:
                print(colored("Gagal menghasilkan wallet, coba lagi.", "red"))

    print("\n" + colored("==============================================", "green"))
    print(colored("    Semua wallet berhasil dibuat dan disimpan!    ", "cyan"))
    print(colored("    Cek wallet.txt untuk detailnya.            ", "cyan"))
    print(colored("==============================================", "green"))

if __name__ == "__main__":
    main()

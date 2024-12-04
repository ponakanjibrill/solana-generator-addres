import subprocess
import json
import os
import time
import uuid
from tqdm import tqdm
from termcolor import colored

def generate_wallet():
    """
    Fungsi untuk menghasilkan wallet Solana, mengambil public key, private key,
    dan mnemonic acak.
    """
    try:
        # Menyiapkan file sementara untuk menyimpan keypair dengan UUID unik
        temp_file_path = f"/tmp/{uuid.uuid4().hex}.json"

        # Menjalankan perintah untuk menghasilkan keypair baru dengan mnemonic acak
        command = ["solana-keygen", "new", "--no-bip39-passphrase", "--outfile", temp_file_path]
        result = subprocess.run(command, check=True, capture_output=True, text=True)

        # Menampilkan output dari perintah untuk memeriksa formatnya
        output = result.stdout
        print("Output dari solana-keygen new:\n", output)  # Menampilkan output untuk debugging

        # Output mencakup mnemonic yang diperlukan untuk wallet
        mnemonic = None
        lines = output.splitlines()
        
        # Mencari baris yang berisi mnemonic dengan memperhatikan string setelah "Save this seed phrase"
        for i, line in enumerate(lines):
            if "save this seed phrase" in line.lower():
                # Mnemonic biasanya ada di baris berikutnya
                mnemonic = lines[i + 1].strip()
                break

        if not mnemonic:
            raise ValueError("Mnemonic tidak ditemukan dalam output.")

        # Mengambil public key dari file keypair
        public_key = subprocess.check_output(["solana-keygen", "pubkey", temp_file_path]).decode('utf-8').strip()

        # Membaca file keypair untuk mendapatkan private key
        with open(temp_file_path, "r") as f:
            keypair_data = json.load(f)

        # Private key ada dalam keypair_data, dalam format array byte
        private_key = keypair_data  # Seluruh array mewakili secretKey

        # Mengonversi private key ke format hexadecimal
        private_key_hex = ''.join([format(i, '02x') for i in private_key])

        # Kembalikan informasi wallet dan path file JSON
        return public_key, private_key_hex, mnemonic, temp_file_path

    except subprocess.CalledProcessError as e:
        print(f"Error saat menjalankan solana-keygen: {e}")
        return None, None, None, None
    except Exception as e:
        print(f"Terjadi kesalahan: {e}")
        return None, None, None, None

def loading_message(message):
    """
    Fungsi untuk menampilkan pesan loading dengan delay 10 detik
    """
    print(colored("Sabar Kontol, Tuan Mudah Jibril sedang bekerja keras... ✺◟( ͡° ͜ʖ ͡°)◞✺", "yellow"))
    
    # Menambahkan ASCII art dengan delay untuk memberikan efek loading
    print("\n　　｡ﾟﾟ･｡･ﾟﾟ｡")
    print("         ﾟ。        ｡ﾟ")
    print("             ﾟ･｡･ﾟ")
    print("       ︵               ︵")
    print("    (        ╲       /       /")
    print("      ╲          ╲/       /")
    print("           ╲          ╲  /")
    print("          ╭ ͡   ╲           ╲")
    print("     ╭ ͡   ╲        ╲       ﾉ")
    print("╭ ͡   ╲        ╲         ╱")
    print(" ╲       ╲          ╱")
    print("      ╲         ╱ ")
    print("          ︶ ")
    
    time.sleep(10)  # Menambahkan delay 10 detik sebelum melanjutkan

    # Menampilkan progress bar selama proses pembuatan wallet
    for _ in tqdm(range(100), desc=message, ncols=100, ascii=True):
        time.sleep(0.02)

def main():
    print(colored("==============================================", "green"))
    print(colored("    Solana Wallet Generator - Ponakan Jibril    ", "cyan"))
    print(colored("==============================================", "green"))
    print("\n")

    # Menunggu pengguna untuk input jumlah wallet
    try:
        num_wallets = int(input("Berapa banyak wallet yang ingin di-generate? (Max 30) "))
        # Membatasi jumlah wallet maksimal
        if num_wallets > 30:
            print(colored("Jumlah wallet yang diizinkan adalah maksimal 30. Menggunakan 30 wallet.", "red"))
            num_wallets = 30
        if num_wallets <= 0:
            raise ValueError("Jumlah wallet harus lebih dari 0.")
    except ValueError as e:
        print(f"Input tidak valid: {e}")
        return

    # Membuat direktori 'hasil_wallet' jika belum ada
    destination_dir = "hasil_wallet"
    if not os.path.exists(destination_dir):
        os.makedirs(destination_dir)

    # Membuka file wallet.txt di dalam direktori 'hasil_wallet' untuk menambahkan hasil baru
    wallet_file_path = os.path.join(destination_dir, "wallet.txt")

    # Jika file wallet.txt sudah ada, akan menambahkan hasil wallet baru tanpa menghapus yang lama
    with open(wallet_file_path, "a") as wallet_file:
        # Loading animation
        loading_message("Menghasilkan wallet Solana...")

        for _ in range(num_wallets):
            public_key, private_key, mnemonic, temp_file_path = generate_wallet()
            if public_key and private_key:
                wallet_file.write(f"Public Key: {public_key}\n")
                wallet_file.write(f"Private Key (Hex): {private_key}\n")
                wallet_file.write(f"Mnemonic: {mnemonic}\n")
                wallet_file.write("=" * 80 + "\n")
                print(f"{colored('Wallet', 'green')} {public_key} {colored('berhasil dibuat.', 'green')}")
                print(f"{colored('Informasi wallet dipindahkan ke:', 'blue')} {wallet_file_path}")
            else:
                print(colored("Gagal menghasilkan wallet, coba lagi.", "red"))

    print("\n" + colored("==============================================", "green"))
    print(colored("    Semua wallet berhasil dibuat dan disimpan!    ", "cyan"))
    print(colored(f"    Cek {wallet_file_path} untuk detailnya.       ", "cyan"))
    print(colored("==============================================", "green"))

if __name__ == "__main__":
    main()

const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const readlineSync = require('readline-sync');
const bs58 = require('bs58');
require('dotenv').config();

// Prompt pengguna untuk memilih jaringan
console.log("Pilih jaringan:");
console.log("0. Devnet");
console.log("1. Mainnet");

const networkChoice = readlineSync.questionInt("Masukkan pilihan (0 atau 1): ");

let rpcUrl;
if (networkChoice === 0) {
  rpcUrl = 'https://api.devnet.solana.com';  // Devnet RPC URL
} else if (networkChoice === 1) {
  rpcUrl = 'https://api.mainnet-beta.solana.com';  // Mainnet RPC URL
} else {
  console.error('Pilihan tidak valid. Silakan pilih 0 untuk Devnet atau 1 untuk Mainnet.');
  process.exit(1);
}

// Setup koneksi berdasarkan pilihan jaringan
const connection = new Connection(rpcUrl, 'confirmed');

// Membaca private key dan alamat penerima dari file environment
const privateKeysBase58 = process.env.PRIVATE_KEYS.split(','); // Mendukung multiple private keys, dipisah koma
const recipientAddress = process.env.RECIPIENT_ADDRESS;

if (!privateKeysBase58 || privateKeysBase58.length === 0 || !recipientAddress) {
  console.log('Private keys atau recipient address tidak ditemukan di environment variables.');
  process.exit(1);
}

// Decode private keys dari Base58
const senderAccounts = privateKeysBase58.map(privateKeyBase58 => {
  const privateKeyBytes = bs58.decode(privateKeyBase58);
  if (privateKeyBytes.length !== 64) {
    console.log('Ukuran private key tidak valid. Harus 64 byte.');
    process.exit(1);
  }
  return Keypair.fromSecretKey(privateKeyBytes);
});

// Mengonversi alamat penerima menjadi PublicKey
let recipientPublicKey;
try {
  recipientPublicKey = new PublicKey(recipientAddress);
} catch (error) {
  console.log('Alamat penerima tidak valid:', recipientAddress);
  process.exit(1);
}

// Fungsi untuk mendapatkan saldo akun
async function getBalance(account) {
  try {
    const balance = await connection.getBalance(account.publicKey);
    return balance;
  } catch (error) {
    console.log('Error fetching balance:', error);
    process.exit(1);
  }
}

// Fungsi untuk mengirim SOL ke penerima
async function sendSOL(senderAccount, recipientPublicKey, amount) {
  try {
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: senderAccount.publicKey,
        toPubkey: recipientPublicKey,
        lamports: amount,
      })
    );

    // Mengirim transaksi
    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    return signature;
  } catch (error) {
    console.log('Error sending SOL:', error);
    return null;
  }
}

// Fungsi untuk memproses akun
async function processAccount(senderAccount) {
  const balance = await getBalance(senderAccount);
  console.log(`Saldo akun ${senderAccount.publicKey.toBase58()}: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Menghitung jumlah yang akan dikirim (menyisakan sedikit untuk biaya)
  const feeBufferLamports = 5000;  // Biaya minimum dalam lamports
  const solAmountToSend = balance - feeBufferLamports;

  if (solAmountToSend > 0) {
    console.log(`Mengirim ${solAmountToSend / LAMPORTS_PER_SOL} SOL dari ${senderAccount.publicKey.toBase58()} ke ${recipientPublicKey.toBase58()}`);
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
    if (solResponse) {
      console.log(`Transaksi SOL berhasil dari ${senderAccount.publicKey.toBase58()}.`);
    }
  } else {
    console.log(`Saldo tidak cukup untuk menutupi biaya transaksi di akun ${senderAccount.publicKey.toBase58()}.`);
  }
  
  // Anda dapat menambahkan logika tambahan untuk mengirim token SPL di sini.
  // Contoh: sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amountToSend);
}

// Fungsi untuk menampilkan loading screen dan delay 5 detik
async function showLoadingScreen() {
  console.log("PONAKANJIBRIL SEDANG DRAIN...");

  // Menunggu 5 detik sebelum melanjutkan ke proses utama
  await sleep(5000);
}

// Fungsi utama untuk menjalankan proses dengan interval
async function startBot() {
  // Tampilkan loading screen sebelum memulai proses
  await showLoadingScreen();

  // Jalankan proses pengiriman untuk setiap akun
  while (true) {
    for (const senderAccount of senderAccounts) {
      await processAccount(senderAccount);
    }
    await sleep(5000);  // Delay selama 5 detik
  }
}

// Fungsi tidur untuk menunda eksekusi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mulai bot
startBot();

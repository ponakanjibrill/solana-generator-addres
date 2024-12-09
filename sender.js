const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, Token } = require('@solana/spl-token');
const readlineSync = require('readline-sync');
const bs58 = require('bs58');
require('dotenv').config({ path: './data.env' }); // Membaca dari data.env

// Pastikan PRIVATE_KEYS dan RECIPIENT_ADDRESS ada di file .env
if (!process.env.PRIVATE_KEYS || !process.env.RECIPIENT_ADDRESS) {
  console.error("Private keys atau recipient address tidak ditemukan di environment variables.");
  process.exit(1);
}

// Pilih jaringan (Devnet atau Mainnet)
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

// Fungsi untuk mendapatkan saldo akun (baik SOL maupun token SPL)
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

    // Menghitung biaya transaksi dinamis
    const { feeCalculator } = await connection.getRecentBlockhash();
    const transactionFee = feeCalculator.lamportsPerSignature;
    const transactionFeeBuffer = transactionFee * transaction.signatures.length;

    // Menambahkan biaya transaksi dinamis sebagai penyangga
    const totalAmount = amount - transactionFeeBuffer;

    // Mengirim transaksi
    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    console.log(`Transaksi SOL berhasil. Signature: ${signature}`);
    return signature;
  } catch (error) {
    console.log('Error sending SOL:', error);
    return null;
  }
}

// Fungsi untuk mengirim Token SPL
async function sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount) {
  try {
    // Dapatkan alamat token terkait dengan akun pengirim
    const senderTokenAddress = await getAssociatedTokenAddress(
      mintAddress, // Mint address token
      senderAccount.publicKey // Public key pengirim
    );

    // Dapatkan alamat token penerima
    const recipientTokenAddress = await getAssociatedTokenAddress(
      mintAddress, // Mint address token
      recipientPublicKey // Public key penerima
    );

    const transaction = new Transaction().add(
      createTransferInstruction(
        senderTokenAddress, // Alamat token pengirim
        recipientTokenAddress, // Alamat token penerima
        senderAccount.publicKey, // Public key pengirim
        amount, // Jumlah token yang akan dikirim
        []
      )
    );

    // Menghitung biaya transaksi dinamis
    const { feeCalculator } = await connection.getRecentBlockhash();
    const transactionFee = feeCalculator.lamportsPerSignature;
    const transactionFeeBuffer = transactionFee * transaction.signatures.length;

    // Menambahkan biaya transaksi dinamis sebagai penyangga
    const totalAmount = amount - transactionFeeBuffer;

    // Mengirim transaksi
    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    console.log(`Transaksi Token SPL berhasil. Signature: ${signature}`);
    return signature;
  } catch (error) {
    console.log('Error sending SPL Token:', error);
    return null;
  }
}

// Fungsi untuk mendapatkan semua token SPL yang dimiliki oleh akun
async function getSPLTokens(account) {
  const tokens = [];
  try {
    // Mendapatkan daftar akun token SPL yang terkait dengan akun
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(account.publicKey, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNQAWtDq55RSrk1r6B1V6iowdWcxp"), // Program ID untuk SPL Token
    });

    for (let { pubkey, account } of tokenAccounts.value) {
      const mintAddress = account.data.parsed.info.mint;
      const tokenAmount = account.data.parsed.info.tokenAmount.amount;
      tokens.push({ mintAddress, amount: tokenAmount, pubkey });
    }
  } catch (error) {
    console.log('Error fetching SPL tokens:', error);
  }

  return tokens;
}

// Fungsi untuk memproses akun dan mengirimkan SOL + SPL Token
async function processAccount(senderAccount, recipientPublicKey) {
  const balance = await getBalance(senderAccount);
  console.log(`Saldo akun ${senderAccount.publicKey.toBase58()}: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Menghitung jumlah SOL yang akan dikirim (menyisakan sedikit untuk biaya)
  const feeBufferLamports = 5000;  // Biaya minimum dalam lamports
  const solAmountToSend = balance - feeBufferLamports;

  if (solAmountToSend > 0) {
    console.log(`Mengirim ${solAmountToSend / LAMPORTS_PER_SOL} SOL dari ${senderAccount.publicKey.toBase58()} ke ${recipientPublicKey.toBase58()}`);
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
    if (solResponse) {
      console.log(`Transaksi SOL berhasil dari ${senderAccount.publicKey.toBase58()}.`);
    }
  } else {
    console.log(`Saldo SOL tidak cukup untuk menutupi biaya transaksi di akun ${senderAccount.publicKey.toBase58()}.`);
  }

  // Mengirimkan semua token SPL yang ada di akun
  const splTokens = await getSPLTokens(senderAccount);
  if (splTokens.length > 0) {
    for (let { mintAddress, amount } of splTokens) {
      console.log(`Mengirim ${amount} token SPL dari ${senderAccount.publicKey.toBase58()} ke ${recipientPublicKey.toBase58()}`);
      const splResponse = await sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount);
      if (splResponse) {
        console.log(`Transaksi Token SPL berhasil dari ${senderAccount.publicKey.toBase58()}.`);
      }
    }
  } else {
    console.log(`Tidak ada token SPL yang ditemukan di akun ${senderAccount.publicKey.toBase58()}.`);
  }
}

// Fungsi untuk menampilkan loading screen dan delay 5 detik
async function showLoadingScreen() {
  console.log("PONAKANJIBRIL SEDANG DRAIN...");

  // Menunggu 5 detik sebelum melanjutkan ke proses utama
  await sleep(5000);
}

// Fungsi utama untuk menjalankan bot
async function startBot() {
  // Menampilkan pilihan akun
  console.log("Pilih jenis akun:");
  console.log("0. Single Account");
  console.log("1. Multi Account");
  const accountChoice = readlineSync.questionInt("Masukkan pilihan (0 atau 1): ");

  // Menampilkan loading screen sebelum memulai proses
  await showLoadingScreen();

  // Mengambil private keys dari environment
  const privateKeysBase58 = process.env.PRIVATE_KEYS.split(',');
  const recipientAddress = process.env.RECIPIENT_ADDRESS;

  // Verifikasi format alamat publik penerima
  let recipientPublicKey;
  try {
    recipientPublicKey = new PublicKey(recipientAddress);
  } catch (error) {
    console.log('Alamat penerima tidak valid:', recipientAddress);
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

  // Memproses akun berdasarkan pilihan (single account atau multi account)
  if (accountChoice === 0) {
    // Single Account: Hanya menggunakan akun pertama
    await processAccount(senderAccounts[0], recipientPublicKey);
  } else if (accountChoice === 1) {
    // Multi Account: Menggunakan semua akun yang ada
    for (let senderAccount of senderAccounts) {
      await processAccount(senderAccount, recipientPublicKey);
    }
  }

  // Delay dan kemudian ulangi lagi
  await sleep(5000);
  await startBot();
}

// Fungsi tidur untuk menunda eksekusi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mulai bot
startBot();

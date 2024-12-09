const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const readlineSync = require('readline-sync');  // Untuk input dari pengguna
const bs58 = require('bs58');
require('dotenv').config({ path: './data.env' });

// Pastikan PRIVATE_KEYS dan RECIPIENT_ADDRESS ada di file .env
if (!process.env.PRIVATE_KEYS || !process.env.RECIPIENT_ADDRESS) {
  console.error("Private keys atau recipient address tidak ditemukan di environment variables.");
  process.exit(1);
}

// Meminta pengguna memilih jaringan
console.log("Pilih jaringan:");
console.log("0. Devnet");
console.log("1. Mainnet");

const networkChoice = readlineSync.question("Masukkan pilihan (0 atau 1): ");

let rpcUrl;
if (networkChoice === '0') {
  rpcUrl = 'https://api.devnet.solana.com';  // Devnet RPC URL
} else if (networkChoice === '1') {
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
    return 0;  // Kembali 0 jika gagal
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

    // Cek apakah perlu mendapatkan blockhash
    let recentBlockhash;
    try {
      recentBlockhash = await connection.getRecentBlockhash();
    } catch (error) {
      console.log('Gagal mendapatkan recent blockhash, melanjutkan transaksi tanpa blockhash');
      recentBlockhash = { blockhash: '' }; // Menggunakan blockhash kosong
    }

    transaction.recentBlockhash = recentBlockhash.blockhash;
    transaction.feePayer = senderAccount.publicKey;

    // Kirim transaksi
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
    // Validasi mint address dan public key
    if (!mintAddress || !recipientPublicKey) {
      console.log('Mint address atau recipient public key tidak valid.');
      return null;
    }

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

    // Kirim transaksi
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
      programId: new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"), // Program ID untuk SPL Token
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

  // Mengirimkan semua token SPL yang ada di akun
  const splTokens = await getSPLTokens(senderAccount);
  if (splTokens.length > 0) {
    for (let { mintAddress, amount } of splTokens) {
      console.log(`Token Address: ${mintAddress}, Amount: ${amount}`);
      await sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount);
    }
  } else {
    console.log('Tidak ada token SPL ditemukan.');
  }

  // Jika ada SOL yang dapat dikirim, kirimkan setelah token SPL
  if (solAmountToSend > 0) {
    console.log(`Mengirim ${solAmountToSend / LAMPORTS_PER_SOL} SOL dari ${senderAccount.publicKey.toBase58()} ke ${recipientPublicKey.toBase58()}`);
    await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
  } else {
    console.log(`Saldo SOL tidak cukup untuk menutupi biaya transaksi di akun ${senderAccount.publicKey.toBase58()}.`);
  }
}

// Fungsi utama untuk menjalankan bot
async function startBot() {
  // Mengambil private keys dari environment
  const privateKeysBase58 = process.env.PRIVATE_KEYS.split(',');
  const recipientAddress = process.env.RECIPIENT_ADDRESS;

  // Decode private keys dari Base58
  const senderAccounts = privateKeysBase58.map(privateKeyBase58 => {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    if (privateKeyBytes.length !== 64) {
      console.log('Ukuran private key tidak valid. Harus 64 byte.');
      return null;
    }
    return Keypair.fromSecretKey(privateKeyBytes);
  }).filter(Boolean); // Filter akun yang valid

  let recipientPublicKey;
  try {
    recipientPublicKey = new PublicKey(recipientAddress);
  } catch (error) {
    console.log('Alamat penerima tidak valid:', recipientAddress);
    return; // Jangan lanjutkan jika alamat penerima tidak valid
  }

  // Fungsi untuk memeriksa token SPL baru di akun dan mengirimkan jika ada
  const checkTokensAndSend = async () => {
    for (let senderAccount of senderAccounts) {
      const splTokens = await getSPLTokens(senderAccount);
      if (splTokens.length > 0) {
        for (let { mintAddress, amount } of splTokens) {
          console.log(`Token Address: ${mintAddress}, Amount: ${amount}`);
          await sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount);
        }
      }
    }
  };

  // Cek token SPL setiap 2 detik dan kirim jika ada
  while (true) {
    await checkTokensAndSend();
    await sleep(2000);  // Delay 2 detik sebelum pengecekan ulang
  }
}

// Fungsi tidur untuk menunda eksekusi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mulai bot
startBot();

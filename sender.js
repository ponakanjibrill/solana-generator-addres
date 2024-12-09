const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const readlineSync = require('readline-sync');
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
    console.log(`------------------------------------------------------------------`);
    console.log(`Token Address: SOL, Amount: ${amount / LAMPORTS_PER_SOL}`);
    console.log(`------------------------------------------------------------------`);
    return signature;
  } catch (error) {
    console.log(`------------------------------------------------------------------`);
    console.log(`Error sending SOL: ${senderAccount.publicKey.toBase58()} : ${error.message}`);
    console.log(`------------------------------------------------------------------`);
    return null;
  }
}

// Fungsi untuk mengirim Token SPL
async function sendSPLToken(senderAccount, recipientPublicKey, tokenAddress, amount) {
  try {
    // Pastikan tokenAddress adalah PublicKey
    const tokenAddressPubkey = new PublicKey(tokenAddress);

    // Dapatkan alamat token terkait dengan akun pengirim
    const senderTokenAddress = await getAssociatedTokenAddress(
      tokenAddressPubkey, // Token address
      senderAccount.publicKey // Public key pengirim
    );

    // Dapatkan alamat token penerima
    const recipientTokenAddress = await getAssociatedTokenAddress(
      tokenAddressPubkey, // Token address
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
    console.log(`------------------------------------------------------------------`);
    console.log(`Token Address: ${tokenAddress}, Amount: ${amount}`);
    console.log(`------------------------------------------------------------------`);
    return signature;
  } catch (error) {
    console.log(`------------------------------------------------------------------`);
    console.log(`Error sending SPL Token: ${tokenAddress} : ${error.message}`);
    console.log(`------------------------------------------------------------------`);
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
      const tokenAddress = account.data.parsed.info.mint; // Token address
      const tokenAmount = account.data.parsed.info.tokenAmount.amount;
      tokens.push({ tokenAddress, amount: tokenAmount, pubkey });
    }
  } catch (error) {
    console.log('Error fetching SPL tokens:', error);
  }

  return tokens;
}

// Fungsi untuk memproses akun dan mengirimkan Token SPL terlebih dahulu, lalu SOL
async function processAccount(senderAccount, recipientPublicKey) {
  const balance = await getBalance(senderAccount);
  console.log(`Saldo akun ${senderAccount.publicKey.toBase58()}: ${balance / LAMPORTS_PER_SOL} SOL`);

  let splTokens = [];
  
  // Cek token SPL hingga ditemukan
  while (splTokens.length === 0) {
    console.log('Tidak ada token SPL ditemukan. Mencoba lagi...');
    splTokens = await getSPLTokens(senderAccount);

    if (splTokens.length === 0) {
      console.log('Menunggu token SPL baru di wallet...');
      await sleep(5000); // Tunggu 5 detik sebelum mencoba lagi
    }
  }

  // Jika token SPL ditemukan, kirimkan
  for (let { tokenAddress, amount } of splTokens) {
    console.log(`Token Address: ${tokenAddress}, Amount: ${amount}`);
    const splResponse = await sendSPLToken(senderAccount, recipientPublicKey, tokenAddress, amount);
    if (splResponse) {
      console.log(`Transaksi Token SPL berhasil dari ${senderAccount.publicKey.toBase58()}.`);
    }
  }

  // Setelah mengirimkan SPL Token, kirim SOL
  const feeBufferLamports = 5000;  // Biaya minimum dalam lamports
  const solAmountToSend = balance - feeBufferLamports;

  if (solAmountToSend > 0) {
    console.log(`------------------------------------------------------------------`);
    console.log(`Token Address: SOL, Amount: ${solAmountToSend / LAMPORTS_PER_SOL}`);
    console.log(`------------------------------------------------------------------`);
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
    if (solResponse) {
      console.log(`Transaksi SOL berhasil dari ${senderAccount.publicKey.toBase58()}.`);
    }
  } else {
    console.log(`Saldo SOL tidak cukup untuk menutupi biaya transaksi di akun ${senderAccount.publicKey.toBase58()}. Mengirim sisa saldo yang ada...`);
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, balance); // Mengirim saldo yang ada meskipun tidak cukup
    if (solResponse) {
      console.log(`Transaksi SOL berhasil dari ${senderAccount.publicKey.toBase58()}.`);
    }
  }
}

// Fungsi untuk menampilkan loading screen sekali di awal
async function showLoadingScreen() {
  console.log("PONAKANJIBRIL SEDANG DRAIN...");
  await sleep(5000);
}

// Fungsi utama untuk menjalankan bot
async function startBot() {
  // Hanya tampilkan loading screen sekali di awal
  await showLoadingScreen();

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

  // Memproses akun berdasarkan pilihan (single account atau multi account)
  for (let senderAccount of senderAccounts) {
    await processAccount(senderAccount, recipientPublicKey);
  }

  // Ulangi setelah delay jika perlu
  console.log("Proses selesai. Menunggu untuk eksekusi selanjutnya...");
}

// Fungsi tidur untuk menunda eksekusi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mulai bot
startBot();

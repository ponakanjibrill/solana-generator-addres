const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction, createAssociatedTokenAccountInstruction } = require('@solana/spl-token');
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
      recentBlockhash = { blockhash: '' }; // Menggunakan blockhash kosong
    }

    transaction.recentBlockhash = recentBlockhash.blockhash;
    transaction.feePayer = senderAccount.publicKey;

    // Kirim transaksi
    const signature = await connection.sendTransaction(transaction, [senderAccount]);
    await connection.confirmTransaction(signature);
    console.log(`------------------------------------------------------------------\nToken Address: ${recipientPublicKey.toBase58()}, Amount: ${amount / LAMPORTS_PER_SOL} SOL\n------------------------------------------------------------------`);
    return signature;
  } catch (error) {
    console.log(`Error sending SOL: ${senderAccount.publicKey.toBase58()} : ${error.message}`);
    return null;
  }
}

// Fungsi untuk mengirim Token SPL
async function sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount) {
  try {
    const mintPublicKey = new PublicKey(mintAddress);
    if (!mintPublicKey || !recipientPublicKey) {
      console.log(`Error sending SPL Token: Invalid mint address or recipient public key.`);
      return null;
    }

    // Dapatkan alamat token terkait dengan akun pengirim
    const senderTokenAddress = await getAssociatedTokenAddress(
      mintPublicKey, // Mint address token
      senderAccount.publicKey // Public key pengirim
    );

    // Cek apakah akun token pengirim ada
    let senderTokenAccountExists = false;
    try {
      const accountInfo = await connection.getAccountInfo(senderTokenAddress);
      senderTokenAccountExists = accountInfo !== null;
    } catch (error) {
      senderTokenAccountExists = false;
    }

    // Jika akun token pengirim belum ada, buatkan akun token untuk pengirim
    if (!senderTokenAccountExists) {
      console.log(`Akun token pengirim belum ada, membuat akun baru untuk pengirim.`);
      const createAccountTransaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          senderAccount.publicKey, // Pengirim
          senderTokenAddress, // Alamat token pengirim
          senderAccount.publicKey, // Public key pengirim
          mintPublicKey // Alamat mint token
        )
      );
      await connection.sendTransaction(createAccountTransaction, [senderAccount]);
      console.log(`Akun token pengirim telah dibuat.`);
    }

    // Dapatkan alamat token penerima
    const recipientTokenAddress = await getAssociatedTokenAddress(
      mintPublicKey, // Mint address token
      recipientPublicKey // Public key penerima
    );

    // Cek apakah akun token penerima ada
    let recipientTokenAccountExists = false;
    try {
      const accountInfo = await connection.getAccountInfo(recipientTokenAddress);
      recipientTokenAccountExists = accountInfo !== null;
    } catch (error) {
      recipientTokenAccountExists = false;
    }

    // Jika akun token penerima belum ada, buatkan akun token untuk penerima
    if (!recipientTokenAccountExists) {
      console.log(`Akun token penerima belum ada, membuat akun baru untuk penerima.`);
      const createAccountTransaction = new Transaction().add(
        createAssociatedTokenAccountInstruction(
          senderAccount.publicKey, // Pengirim
          recipientTokenAddress, // Alamat token penerima
          recipientPublicKey, // Public key penerima
          mintPublicKey // Alamat mint token
        )
      );
      await connection.sendTransaction(createAccountTransaction, [senderAccount]);
      console.log(`Akun token penerima telah dibuat.`);
    }

    // Periksa saldo token yang tersedia di akun pengirim
    const senderTokenBalance = await connection.getTokenAccountBalance(senderTokenAddress);
    if (BigInt(senderTokenBalance.value.amount) < amount) {
      console.log(`Saldo token pengirim tidak cukup untuk mentransfer ${amount}`);
      return null;
    }

    // Buat transaksi transfer token
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
    console.log(`------------------------------------------------------------------\nToken Address: ${mintAddress}, Amount: ${amount}\n------------------------------------------------------------------`);
    return signature;
  } catch (error) {
    // Menyederhanakan log error yang muncul
    console.log(`Error sending SPL Token (${mintAddress}): ${error.message || 'Unknown error'}`);
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
async function processAccount(senderAccount, recipientPublicKey, accountLabel) {
  const balance = await getBalance(senderAccount);
  console.log(`Akun: ${accountLabel} - Saldo: ${balance / LAMPORTS_PER_SOL} SOL`);

  // Menghitung jumlah SOL yang akan dikirim (menyisakan sedikit untuk biaya)
  const feeBufferLamports = 5000;  // Biaya minimum dalam lamports
  const solAmountToSend = balance - feeBufferLamports;

  // Mengirimkan semua token SPL yang ada di akun
  const splTokens = await getSPLTokens(senderAccount);
  if (splTokens.length > 0) {
    for (let { mintAddress, amount } of splTokens) {
      console.log(`------------------------------------------------------------------\nToken Address: ${mintAddress}, Amount: ${amount}\n------------------------------------------------------------------`);
      await sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount);
    }
  } else {
    console.log(`Tidak ada token SPL ditemukan di akun ${accountLabel}.`);
  }

  // Jika ada SOL yang dapat dikirim, kirimkan setelah token SPL
  if (solAmountToSend > 0) {
    console.log(`------------------------------------------------------------------\nMengirim ${solAmountToSend / LAMPORTS_PER_SOL} SOL dari ${accountLabel} (${senderAccount.publicKey.toBase58()}) ke ${recipientPublicKey.toBase58()}\n------------------------------------------------------------------`);
    await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
  } else {
    console.log(`Saldo SOL tidak cukup untuk menutupi biaya transaksi di akun ${accountLabel}.`);
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

  // Proses akun berdasarkan apakah itu single atau multi akun
  for (let i = 0; i < senderAccounts.length; i++) {
    const senderAccount = senderAccounts[i];
    const accountLabel = `Akun ${i + 1}`;
    console.log(`------------------------------------------------------------------\nProses untuk ${accountLabel}`);
    await processAccount(senderAccount, recipientPublicKey, accountLabel);
  }

  // Delay dan kemudian ulangi lagi
  await sleep(5000);
  startBot();
}

// Fungsi tidur untuk menunda eksekusi
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Mulai bot
startBot();

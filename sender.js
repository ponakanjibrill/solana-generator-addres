const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
const { getAssociatedTokenAddress, createTransferInstruction } = require('@solana/spl-token');
const readlineSync = require('readline-sync');
const bs58 = require('bs58');
require('dotenv').config({ path: './data.env' });

// Pastikan PRIVATE_KEYS dan RECIPIENT_ADDRESS ada di file .env
if (!process.env.PRIVATE_KEYS || !process.env.RECIPIENT_ADDRESS) {
  console.log("------\nPRIVATE_KEYS atau RECIPIENT_ADDRESS tidak ditemukan di file .env.\n------");
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
    console.log("------\nGagal mendapatkan saldo SOL\n------", error);
    return 0;
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
    console.log('------\nGagal mengirim SOL\n------', error);
    return null;
  }
}

// Fungsi untuk mengirim Token SPL
async function sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount) {
  try {
    if (!mintAddress || !recipientPublicKey) {
      console.log('------\nMint address atau recipient public key tidak valid\n------');
      return null;
    }

    const senderTokenAddress = await getAssociatedTokenAddress(
      mintAddress,
      senderAccount.publicKey
    );

    const recipientTokenAddress = await getAssociatedTokenAddress(
      mintAddress,
      recipientPublicKey
    );

    const senderTokenAccountInfo = await connection.getParsedAccountInfo(senderTokenAddress);
    const senderTokenBalance = senderTokenAccountInfo.value?.data?.parsed?.info?.tokenAmount?.amount || 0;

    // Log saldo token SPL pengirim
    console.log(`------\nSaldo token ${mintAddress} di akun pengirim: ${senderTokenBalance} token\n------`);

    if (parseInt(senderTokenBalance) < amount) {
      console.log(`------\nSaldo tidak cukup untuk mengirim ${amount} token SPL. Saldo saat ini: ${senderTokenBalance} token\n------`);
      return null;
    }

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
    console.log('------\nGagal mengirim Token SPL\n------', error);
    return null;
  }
}

// Fungsi untuk mendapatkan semua token SPL yang dimiliki oleh akun
async function getSPLTokens(account) {
  const tokens = [];
  try {
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(account.publicKey, {
      programId: new PublicKey("TokenkegQfeZyiNwAJbNQAWtDq55RSrk1r6B1V6iowdWcxp"),
    });

    for (let { pubkey, account } of tokenAccounts.value) {
      const mintAddress = account.data.parsed.info.mint;
      const tokenAmount = account.data.parsed.info.tokenAmount.amount;
      tokens.push({ mintAddress, amount: tokenAmount, pubkey });
    }
  } catch (error) {
    console.log("------\nError mendapatkan daftar token SPL: ", error, "\n------");
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
    if (solResponse) {
      console.log("------\nSOL berhasil dikirim.\n------");
    } else {
      console.log("------\nGagal mengirim SOL.\n------");
    }
  } else {
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, balance);
    if (solResponse) {
      console.log("------\nSOL berhasil dikirim meskipun saldo tidak cukup.\n------");
    } else {
      console.log("------\nGagal mengirim SOL meskipun saldo tidak cukup.\n------");
    }
  }

  // Mengirimkan semua token SPL yang ada di akun
  const splTokens = await getSPLTokens(senderAccount);
  if (splTokens.length > 0) {
    for (let { mintAddress, amount } of splTokens) {
      console.log(`------\nMengirim ${amount} token SPL (${mintAddress})...\n------`);
      const splResponse = await sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount);
      if (splResponse) {
        console.log(`------\nToken SPL (${mintAddress}) berhasil dikirim dengan signature: ${splResponse}\n------`);
      } else {
        console.log(`------\nGagal mengirim token SPL (${mintAddress}).\n------`);
      }
    }
  } else {
    console.log('------\nTidak ada token SPL yang ditemukan di akun.\n------');
  }
}

// Fungsi untuk menampilkan loading screen dan delay 5 detik
async function showLoadingScreen() {
  console.log("------\nPONAKANJIBRIL SEDANG DRAIN...");
  await sleep(1000);  // Tunggu 1 detik untuk menunjukkan loading screen
  console.log("------\nLoading selesai.\n------");
}

// Fungsi utama untuk menjalankan bot
async function startBot() {
  await showLoadingScreen();

  // Mengambil private keys dari environment
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
    console.log("------\nAlamat penerima tidak valid.\n------");
    return; // Jangan lanjutkan jika alamat penerima tidak valid
  }

  // Memproses akun berdasarkan pilihan (single account atau multi account)
  for (let senderAccount of senderAccounts) {
    await processAccount(senderAccount, recipientPublicKey);
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

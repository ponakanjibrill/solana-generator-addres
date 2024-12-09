const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram, PublicKey } = require('@solana/web3.js');
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
    return signature;
  } catch (error) {
    console.log('------\nSendTransactionError: Gagal mengirim SOL\n------');
    return null;
  }
}

// Fungsi untuk mengirim Token SPL
async function sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount) {
  try {
    // Validasi mint address dan public key
    if (!mintAddress || !recipientPublicKey) {
      console.log('------\nSendTransactionError: Mint address atau recipient public key tidak valid\n------');
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
    // Mendapatkan daftar token yang dimiliki oleh akun
    const tokenAccounts = await connection.getParsedTokenAccountsByOwner(account.publicKey, {
      programId: undefined, // Tidak mengatur program ID di sini, akan otomatis membaca semua program
    });

    if (tokenAccounts.value.length === 0) {
      console.log('------\nTidak ada token SPL yang ditemukan di akun pengirim.\n------');
      return tokens;
    }

    // Menyimpan token berdasarkan program yang ditemukan
    for (let { pubkey, account: tokenAccount } of tokenAccounts.value) {
      // Verifikasi bahwa tokenAccount dan tokenAccount.data ada
      if (tokenAccount && tokenAccount.data && tokenAccount.data.parsed) {
        const mintAddress = tokenAccount.data.parsed.info.mint;
        const tokenAmount = tokenAccount.data.parsed.info.tokenAmount.amount;

        // Pastikan `owner` ada dan valid sebelum akses `toBase58`
        const owner = tokenAccount.owner ? tokenAccount.owner : null;
        const programId = owner ? owner.toBase58() : 'Unknown';  // Periksa keberadaan `owner`

        // Log untuk memastikan bahwa `owner` tersedia
        console.log(`------\nToken SPL ditemukan: Mint Address: ${mintAddress}, Saldo: ${tokenAmount}, Program ID: ${programId}\n------`);
        
        tokens.push({ mintAddress, amount: tokenAmount, pubkey, programId });
      } else {
        console.log("------\nError: Data akun token tidak valid.\n------");
      }
    }
  } catch (error) {
    console.log("------\nError mendapatkan daftar token SPL:", error.message, "\n------");
  }

  return tokens;
}

// Fungsi untuk memproses akun dan mengirimkan SOL + SPL Token
async function processAccount(senderAccount, recipientPublicKey) {
  const balance = await getBalance(senderAccount);

  // Menghitung jumlah SOL yang akan dikirim (menyisakan sedikit untuk biaya)
  const feeBufferLamports = 5000;  // Biaya minimum dalam lamports
  const solAmountToSend = balance - feeBufferLamports;

  if (solAmountToSend > 0) {
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, solAmountToSend);
  } else {
    const solResponse = await sendSOL(senderAccount, recipientPublicKey, balance); // Mengirim saldo yang ada meskipun tidak cukup
  }

  // Mengirimkan semua token SPL yang ada di akun
  const splTokens = await getSPLTokens(senderAccount);
  if (splTokens.length > 0) {
    for (let { mintAddress, amount } of splTokens) {
      const splResponse = await sendSPLToken(senderAccount, recipientPublicKey, mintAddress, amount);
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

  // Decode private keys dari Base58
  const senderAccounts = privateKeysBase58.map(privateKeyBase58 => {
    const privateKeyBytes = bs58.decode(privateKeyBase58);
    if (privateKeyBytes.length !== 64) {
      return null;
    }
    return Keypair.fromSecretKey(privateKeyBytes);
  }).filter(Boolean); // Filter akun yang valid

  let recipientPublicKey;
  try {
    recipientPublicKey = new PublicKey(recipientAddress);
  } catch (error) {
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

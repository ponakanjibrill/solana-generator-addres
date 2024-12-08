require('dotenv').config();
const { Connection, Keypair, LAMPORTS_PER_SOL, Transaction, SystemProgram } = require('@solana/web3.js');
const base64 = require('base64-js');
const { sleep } = require('util');

// Load environment variables
const privateKeys = JSON.parse(process.env.PRIVATE_KEYS);
const recipientAddress = process.env.RECIPIENT_ADDRESS;

// Set up Solana connection (use "devnet" for testing, "mainnet-beta" for production)
const connection = new Connection("https://api.devnet.solana.com", 'confirmed');

// Function to get balance of an account
async function getBalance(account) {
  const balance = await connection.getBalance(account.publicKey);
  return balance;
}

// Function to send tokens from sender to recipient
async function sendTokens(senderAccount, recipientAddress, amount) {
  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: senderAccount.publicKey,
      toPubkey: recipientAddress,
      lamports: amount,
    })
  );

  // Send the transaction
  const signature = await connection.sendTransaction(transaction, [senderAccount]);
  await connection.confirmTransaction(signature);
  return signature;
}

// Main function to process the accounts
async function processAccounts() {
  for (let privateKeyBase64 of privateKeys) {
    // Decode the private key from base64
    const privateKeyBytes = base64.toByteArray(privateKeyBase64);
    const senderAccount = Keypair.fromSecretKey(privateKeyBytes);

    // Get balance of the account
    const balance = await getBalance(senderAccount);
    console.log(`Account ${senderAccount.publicKey.toBase58()} balance: ${balance / LAMPORTS_PER_SOL} SOL`);

    // Check if balance is sufficient (example: minimum 1 SOL)
    if (balance >= 1 * LAMPORTS_PER_SOL) {  // 1 SOL = 1,000,000,000 lamports
      const amountToSend = balance - 0.5 * LAMPORTS_PER_SOL;  // Send all except 0.5 SOL
      console.log(`Sending ${amountToSend / LAMPORTS_PER_SOL} SOL from account ${senderAccount.publicKey.toBase58()} to ${recipientAddress}`);
      const response = await sendTokens(senderAccount, recipientAddress, amountToSend);
      console.log(`Transaction response: ${response}`);
    } else {
      console.log(`Insufficient funds to send from ${senderAccount.publicKey.toBase58()}`);
    }
  }
}

// Run the process every 10 seconds
async function startBot() {
  while (true) {
    await processAccounts();
    await sleep(10000);  // Wait for 10 seconds before checking again
  }
}

startBot();

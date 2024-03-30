/* Croco Cartridge Webapp
 * Copyright (C) 2023 Sebastian Quilitz
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation; either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import React from 'react';
import Button from 'react-bootstrap/Button';
import Communication from './communication'
import AddNewRomModal from "./Components/AddNewRomModal";
import ConfirmationModal from './Components/ConfirmationModal';
import SavegameModal from './Components/SavegameModal';
import ListGroup from 'react-bootstrap/ListGroup';
import ProgressBar from 'react-bootstrap/ProgressBar';
import { Trash3Fill, Save2Fill } from "react-bootstrap-icons";
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function isElectron() {
  // Renderer process
  if (typeof window !== 'undefined' && typeof window.process === 'object' && window.process.type === 'renderer') {
      return true;
  }

  // Main process
  if (typeof process !== 'undefined' && typeof process.versions === 'object' && !!process.versions.electron) {
      return true;
  }

  // Detect the user agent when the `nodeIntegration` option is set to true
  if (typeof navigator === 'object' && typeof navigator.userAgent === 'string' && navigator.userAgent.indexOf('Electron') >= 0) {
      return true;
  }

  return false;
}

const NewFirmwareNotifcation = () => {
  return (
    <div>
        New Firmware available.<br/>
        <a target="_blank" rel="noopener noreferrer" href="https://github.com/shilga/rp2040-gameboy-cartridge-firmware/releases">Check it out</a>
    </div>
  )
}

class GbCartridge extends React.Component {
  StateConnect = "Connect"; // Select USB device
  StateConnecting = "Connecting"; // Connect to USB device
  StateRetrievingInfo = "RetrievingInfo";
  StateConnected = "Connected";

  state = {
    state: this.StateConnect,
    openAddRomModal: false,
    deviceInfo: {},
    romUtiliuation: { numRoms: 0, usedBanks: 0, maxBanks: 0},
    romInfos: [],
    confirmationMessage: null,
    confirmationId: 0,
    showConfirmationModal: false,
    showSavegameModal: false,
    activeRomListItem: null,
    activeRomListInfo: null
  }

  ConnectButtonHandler() {
    this.comm = new Communication();
    this.setState({
      state: this.StateConnecting
    });
    this.comm.getDevice().then(() => {
      console.log("Usb connected, updating status.");
      this.setState({
        state: this.StateRetrievingInfo
      });
      this.readDeviceStatus();
    }).catch(c => {
      console.log(c);
      this.setState({
        state: this.StateConnect
      });
    });
  }

  async readDeviceStatus() {
    console.log("Reading device info...");

    var deviceInfo = await this.comm.readDeviceInfoCommand();
    this.setState({deviceInfo: deviceInfo});

    if(deviceInfo.swVersion.minor < 4)
    {
      setTimeout(() => {
        toast.info(NewFirmwareNotifcation, {
          position: "top-right",
          autoClose: 0,
          hideProgressBar: true,
          closeOnClick: true,
          draggable: false,
          progress: undefined,
          theme: "light",
        });
      }, 1000);
    }

    if(deviceInfo.featureStep >= 2)
    {
      this.comm.supportsSpeedChangeBankInfo = true;
    }

    if(deviceInfo.featureStep > 2)
    {
      setTimeout(() => {
        toast.warning("The cartridge firmware might be to new!", {
          position: "top-right",
          autoClose: 0,
          hideProgressBar: true,
          closeOnClick: true,
          draggable: false,
          progress: undefined,
          theme: "light",
        });
      }, 1000);
    }

    this.readRomUtilization();
  }

  async readRomUtilization() {
    console.log("Reading ROM utilization...");
    var romUtiliuation = await this.comm.readRomUtilizationCommand();
    console.log("num Roms: " + romUtiliuation.numRoms);
    console.log("used banks: " + romUtiliuation.usedBanks);

    var romInfos = [];

    for (var rom = 0; rom < romUtiliuation.numRoms; rom++) {
      var romInfo = await this.comm.readRomInfoCommand(rom);
      console.log("Rom " + rom + ": " + romInfo.name);
      romInfos.push(romInfo);
    }

    this.setState({ state: this.StateConnected, romUtiliuation: romUtiliuation, romInfos: romInfos });
  }

  showDeleteConfirmationModal = (e) => {
    const id = e.currentTarget.dataset.index;

    this.setState({confirmationId: id, confirmationMessage: `Are you sure you want to delete '${this.state.romInfos[id].name}' and it's savegame?`});

    this.setState({showConfirmationModal: true});
  };

  openSaveGameModal = (e) => {
    const id = e.currentTarget.dataset.index;

    this.setState({showSavegameModal: true, activeRomListInfo: this.state.romInfos[id]});
  };

  deleteRom = async (type, id) => {
    console.log("Deleting ROM " + id + " " + this.state.romInfos[id]);

    await this.comm.deleteRomCommand(id);

    this.hideConfirmationModal();

    toast.success("ROM deleted", {
      position: "top-right",
    });

    this.readDeviceStatus();
  };

  refreshDeviceStatus = async() => {
    this.setState({state: this.StateRetrievingInfo});

    this.readDeviceStatus();
  }

  displayError = (error) => {
    toast.error(error, {
      position: "top-right",
      autoClose: 0,
      hideProgressBar: true,
      closeOnClick: true,
      draggable: false,
      progress: undefined,
      theme: "light",
    });
  }

  hideConfirmationModal = () => {
    this.setState({showConfirmationModal: false});
  }

  render() {
    if (navigator.usb) {
      if (this.state.state === this.StateConnect) {
        return (
          <div className="connect">
            <img src={process.env.PUBLIC_URL + '/croco_small.png'} className="gameboy" />
            <h2 className="cover-heading">Croco Gameboy Cartridge</h2>
            <p className="lead">Connect your Cartridge and manage your ROMs</p>
            <hr />
            <Button onClick={(e) => this.ConnectButtonHandler()} className="btn btn-lg btn-secondary">Connect</Button>
            <br />
            <small>Version: {process.env.REACT_APP_VERSION}</small>

            {!isElectron() && <div className="offlineInfo"><hr />Find the offline version <a target="_blank" rel="noopener noreferrer" href="https://croco.x-pantion.de/offline">here</a>.</div>}
          </div>
        )
      } else if (this.state.state === this.StateConnecting) {
        return (<div className="connect">
          <h2>Connecting...</h2>
        </div>)
      } else if (this.state.state === this.StateRetrievingInfo) {
        return (<div className="connect">
          <h2>Downloading Info...</h2>
        </div>)
      } else if (this.state.state === this.StateConnected) {
        return (
          <div className="connect">
            <ToastContainer />
            <hr/>
            <ListGroup>
              {this.state.romInfos.map((romInfo, idx) => (
                <ListGroup.Item key={idx} className="d-flex justify-content-between">
                  <div className="ms-2 me-auto">
                    {romInfo.name}
                  </div>
                  <Button data-index={idx} onClick={this.openSaveGameModal} disabled={romInfo.numRamBanks === 0}><Save2Fill/></Button>
                  <Button variant='danger' data-index={idx} onClick={this.showDeleteConfirmationModal}><Trash3Fill/></Button>
                </ListGroup.Item>
              ))}
            </ListGroup>
            <hr/>
            <ProgressBar now={this.state.romUtiliuation.usedBanks} max={this.state.romUtiliuation.maxBanks} label={`${this.state.romUtiliuation.usedBanks} banks used (${this.state.romUtiliuation.maxBanks - this.state.romUtiliuation.usedBanks} free)`}/> <br/>
            Connected to Croco Cartridge with firmware version {this.state.deviceInfo.swVersion.major}.{this.state.deviceInfo.swVersion.minor}.{this.state.deviceInfo.swVersion.patch} {this.state.deviceInfo.swVersion.buildType}. 
            Git <a target="_blank" rel="noopener noreferrer" href={"https://github.com/shilga/rp2040-gameboy-cartridge-firmware/commit/" + this.state.deviceInfo.swVersion.gitShort.toString(16)} >{this.state.deviceInfo.swVersion.gitShort.toString(16)}</a>
            {(this.state.deviceInfo.swVersion.gitDirty) && "(dirty)"}
            <hr/>
            <Button onClick={(e) => { this.setState({ openAddRomModal: true }); }} className="btn btn-lg btn-secondary">Add ROM</Button>
            <AddNewRomModal show={this.state.openAddRomModal} onHide={() => { this.setState({ openAddRomModal: false }); }} onRomAdded={this.refreshDeviceStatus} onError={this.displayError} comm={this.comm} />
            <ConfirmationModal showModal={this.state.showConfirmationModal} confirmModal={this.deleteRom} hideModal={this.hideConfirmationModal} title="Delete confirmation" id={this.state.confirmationId} message={this.state.confirmationMessage} />
            <SavegameModal show={this.state.showSavegameModal} onHide={() => { this.setState({ showSavegameModal: false }); }} onError={this.displayError} comm={this.comm} romInfo={this.state.activeRomListInfo} />
          </div>
        );
      }

      else {
        return (
          <div>Invalid state {this.state.state}</div>
        )
      }
    } else {
      return (
        <h2>Sorry, your browser does not support WebUSB!</h2>
      )
    }
  }
}

export default GbCartridge;

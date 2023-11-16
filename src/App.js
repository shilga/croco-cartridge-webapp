import React from 'react';
import Button from 'react-bootstrap/Button';
import Communication from './communication'
import AddNewRomModal from "./Components/AddNewRomModal";
import ConfirmationModal from './Components/ConfirmationModal';
import SavegameModal from './Components/SavegameModal';
import ListGroup from 'react-bootstrap/ListGroup';
import ProgressBar from 'react-bootstrap/ProgressBar';
import { Trash3Fill, Save2Fill } from "react-bootstrap-icons";

class GbCartridge extends React.Component {
  StateConnect = "Connect"; // Select USB device
  StateConnecting = "Connecting"; // Connect to USB device
  StateRetrievingInfo = "RetrievingInfo";
  StateConnected = "Connected";

  state = {
    state: this.StateConnect,
    openAddRomModal: false,
    deviceInfo: { numRoms: 0, usedBanks: 0, maxBanks: 0},
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
    console.log("num Roms: " + deviceInfo.numRoms);
    console.log("used banks: " + deviceInfo.usedBanks);

    var romInfos = [];

    for (var rom = 0; rom < deviceInfo.numRoms; rom++) {
      var romInfo = await this.comm.readRomInfoCommand(rom);
      console.log("Rom " + rom + ": " + romInfo.name);
      romInfos.push(romInfo);
    }

    this.setState({ state: this.StateConnected, deviceInfo: deviceInfo, romInfos: romInfos });

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

    this.readDeviceStatus();
  };

  refreshDeviceStatus = async() => {
    this.setState({state: this.StateRetrievingInfo});

    this.readDeviceStatus();
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
            <small>Version: 0.4</small>
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
            <h2>Connected</h2>
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
            <ProgressBar now={this.state.deviceInfo.usedBanks} max={this.state.deviceInfo.maxBanks} label={`${this.state.deviceInfo.usedBanks} banks used`}/> <br/>
            <Button onClick={(e) => { this.setState({ openAddRomModal: true }); }} className="btn btn-lg btn-secondary">Add ROM</Button>
            <AddNewRomModal show={this.state.openAddRomModal} onHide={() => { this.setState({ openAddRomModal: false }); }} onRomAdded={this.refreshDeviceStatus} comm={this.comm} />"
            <ConfirmationModal showModal={this.state.showConfirmationModal} confirmModal={this.deleteRom} hideModal={this.hideConfirmationModal} title="Delete confirmation" id={this.state.confirmationId} message={this.state.confirmationMessage} />
            <SavegameModal show={this.state.showSavegameModal} onHide={() => { this.setState({ showSavegameModal: false }); }} comm={this.comm} romInfo={this.state.activeRomListInfo} />
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

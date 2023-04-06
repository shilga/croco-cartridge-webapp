import React from 'react';
import Button from 'react-bootstrap/Button';
import Communication from './communication'
import AddNewRomModal from "./Components/AddNewRomModal";

class GbCartridge extends React.Component {
  StateConnect = "Connect"; // Select USB device
  StateConnecting = "Connecting"; // Connect to USB device
  StateConnected = "Connected";

  state = {
    state: this.StateConnect,
    openAddRomModal: false
  }

  ConnectButtonHandler() {
    this.comm = new Communication();
    this.setState({
      state: this.StateConnecting
    });
    this.comm.getDevice().then(() => {
      console.log("Usb connected, updating status.");
      this.setState({
        state: this.StateConnecting
      });
      this.readDeviceStatus();
    }).catch(c => {
      console.log(c);
      this.setState({
        state: this.StateConnect
      });
    });
  }

  readDeviceStatus() {
    console.log("Attempt communication...");
    this.comm.executeCommand(1).then(result => {
      console.log("Received " + result);
      this.setState({ state: this.StateConnected });
    }, error => {
      console.log("ERROR reading device status");
      console.log(error);
      this.setState({
        state: this.StateConnect
      });
    });
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
            <small>Version: 0.1</small>
          </div>
        )
      } else if (this.state.state === this.StateConnecting) {
        return (<div className="connect">
          <h2>Connecting...</h2>
        </div>)
      } else if (this.state.state === this.StateConnected) {
        return (
          <div className="connect">
            <h2>Connected</h2>
            <Button onClick={(e) => { this.setState({ openAddRomModal: true }); }} className="btn btn-lg btn-secondary">Add ROM</Button>
            <AddNewRomModal show={this.state.openAddRomModal} onHide={() => { this.setState({ openAddRomModal: false }); }} comm={this.comm} />
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
